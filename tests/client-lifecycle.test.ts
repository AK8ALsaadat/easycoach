import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID, createHash } from "node:crypto";
import type { Snapshot } from "@/lib/model";
import { blankContent } from "@/lib/model";
import { riyadhToday } from "@/lib/dates";
import { clientExport, clientExportCsv } from "@/lib/client-export";
import { coach, other, fixtureDatabase } from "./helpers/db";

const hex = () => createHash("sha256").update(randomUUID()).digest("hex");
let f: Awaited<ReturnType<typeof fixtureDatabase>>;
const today = riyadhToday();
const snapshot = (user = coach) => f.call<Snapshot>(user, "management_snapshot");

async function richClient(name = "متدرب الاختبار") {
  const id = await f.client(coach, name);
  const trainee = await f.newTrainee();
  await f.linkTrainee(id, trainee);
  await f.app(coach, "weight_save", { client_id: id, entry_date: today, weight: 80 });
  const program = await f.app<{ id: string }>(coach, "program_save", { client_id: id, name: "برنامج", content: blankContent });
  await f.app(coach, "program_publish", { id: program.id });
  const sub = await f.app<{ id: string }>(coach, "subscription_create", { client_id: id, name: "باقة", start_date: today, end_date: today, price: 500 });
  const payment = randomUUID();
  await f.app(coach, "payment_add", { id: payment, subscription_id: sub.id, amount: 200, method: "bank", paid_date: today, reference: "" });
  await f.app(coach, "payment_reverse", { id: randomUUID(), payment_id: payment, reason: "تصحيح اختباري" });
  await f.manage(coach, "record_save", { id: randomUUID(), client_id: id, kind: "message", entry_date: today, payload: { text: "مرحبا" } });
  await f.app(coach, "invite_create", { client_id: id, token_hash: hex() });
  await f.app(coach, "portal_create", { client_id: id, token_hash: hex(), proof_hash: hex() });
  const photo = randomUUID();
  await f.db.query(
    "insert into public.progress_photos(id,client_id,coach_id,author_id,entry_date,filename,size,mime,status) values($1,$2,$3,$3,$4,'a.jpg',10,'image/jpeg','ready')",
    [photo, id, coach, today],
  );
  return { id, photo, sub: sub.id, trainee };
}

beforeAll(async () => {
  f = await fixtureDatabase();
});
afterAll(async () => f?.db.close());

describe("archive", () => {
  it("keeps all data, records the reason, ends portal access and cancels pending links", async () => {
    const { id, trainee } = await richClient();
    const result = await f.manage<{ archived: boolean; archived_at: string; archived_reason: string }>(coach, "client_archive", { client_id: id, archived: true, reason: "انتهى الاشتراك" });
    expect(result).toMatchObject({ archived: true, archived_reason: "انتهى الاشتراك" });
    expect(result.archived_at).toBeTruthy();
    const { rows: links } = await f.db.query<{ open: number }>(
      "select (select count(*) from public.invitations where client_id=$1 and revoked_at is null and consumed_at is null)+(select count(*) from public.portal_links where client_id=$1 and revoked_at is null) as open",
      [id],
    );
    expect(Number(links[0].open)).toBe(0);
    const coachView = await snapshot();
    expect(coachView.clients.find((c) => c.id === id)?.archived).toBe(true);
    expect(coachView.weights?.some((w) => w.client_id === id)).toBe(true);
    expect(coachView.payments.length).toBeGreaterThan(0);
    // The trainee loses access but is told why.
    const traineeView = await snapshot(trainee);
    expect(traineeView.clients.some((c) => c.id === id)).toBe(false);
    expect(traineeView.weights?.some((w) => w.client_id === id)).toBe(false);
    const status = await f.call<{ client_id: string }[]>(trainee, "trainee_access_status");
    expect(status.map((s) => s.client_id)).toContain(id);
    const audit = await f.db.query<{ action: string; detail: string }>("select action,detail from public.audit where entity_id=$1 and action='أرشفة متدرب'", [id]);
    expect(audit.rows[0]?.detail).toBe("انتهى الاشتراك");
  });

  it("undo shortly after archiving restores the links that the archive revoked", async () => {
    const { id, trainee } = await richClient();
    await f.manage(coach, "client_archive", { client_id: id, archived: true });
    const restored = await f.manage<{ archived: boolean; archived_at: string | null; archived_reason: string | null }>(coach, "client_archive", { client_id: id, archived: false });
    expect(restored).toMatchObject({ archived: false, archived_at: null, archived_reason: null });
    const { rows } = await f.db.query<{ open: number }>("select count(*) as open from public.portal_links where client_id=$1 and revoked_at is null", [id]);
    expect(Number(rows[0].open)).toBe(1);
    expect((await snapshot(trainee)).clients.some((c) => c.id === id)).toBe(true);
  });

  it("a later restore brings back data and account access but not old links", async () => {
    const { id, trainee } = await richClient();
    await f.manage(coach, "client_archive", { client_id: id, archived: true });
    await f.db.query("update public.clients set archived_at=now()-interval '1 day' where id=$1", [id]);
    await f.manage(coach, "client_archive", { client_id: id, archived: false });
    const { rows } = await f.db.query<{ open: number }>("select count(*) as open from public.portal_links where client_id=$1 and revoked_at is null", [id]);
    expect(Number(rows[0].open)).toBe(0);
    expect((await snapshot(trainee)).clients.some((c) => c.id === id)).toBe(true);
  });

  it("only the owning coach can archive, restore, summarise or delete", async () => {
    const { id, trainee } = await richClient();
    await expect(f.manage(other, "client_archive", { client_id: id, archived: true })).rejects.toThrow();
    await expect(f.manage(trainee, "client_archive", { client_id: id, archived: true })).rejects.toThrow();
    expect(await f.call(other, "client_purge_summary", { target: id })).toBeNull();
    await f.manage(coach, "client_archive", { client_id: id, archived: true });
    await expect(f.call(other, "client_purge", { target: id, confirm_name: "متدرب الاختبار" })).rejects.toThrow();
    await expect(f.call(trainee, "client_purge", { target: id, confirm_name: "متدرب الاختبار" })).rejects.toThrow();
  });
});

describe("permanent deletion", () => {
  it("is only possible after archiving and with the exact name", async () => {
    const { id } = await richClient("سارة الاختبار");
    await expect(f.call(coach, "client_purge", { target: id, confirm_name: "سارة الاختبار" })).rejects.toThrow(/أرشف/);
    await f.manage(coach, "client_archive", { client_id: id, archived: true });
    await expect(f.call(coach, "client_purge", { target: id, confirm_name: "سارة" })).rejects.toThrow(/بالضبط/);
  });

  it("summarises, then deletes every linked row and queues photo files", async () => {
    const { id, photo, sub } = await richClient("خالد للحذف");
    await f.manage(coach, "client_archive", { client_id: id, archived: true });
    const summary = await f.call<Record<string, number>>(coach, "client_purge_summary", { target: id });
    expect(summary).toMatchObject({ programs: 1, photos: 1, messages: 1, subscriptions: 1 });
    expect(summary.weights).toBeGreaterThanOrEqual(1);
    await f.call(coach, "client_purge", { target: id, confirm_name: "  خالد   للحذف " });
    for (const table of ["clients", "programs", "weight_entries", "invitations", "portal_links", "subscriptions", "progress_photos"]) {
      const column = table === "clients" ? "id" : "client_id";
      const { rows } = await f.db.query<{ n: number }>(`select count(*) as n from public.${table} where ${column}=$1`, [id]);
      expect(Number(rows[0].n), table).toBe(0);
    }
    const leftovers = await f.db.query<{ n: number }>(
      "select (select count(*) from public.payments where subscription_id=$1)+(select count(*) from public.coaching_records where client_id=$2) as n",
      [sub, id],
    );
    expect(Number(leftovers.rows[0].n)).toBe(0);
    const queued = await f.db.query("select 1 from private.progress_photo_deletions where id=$1", [photo]);
    expect(queued.rows).toHaveLength(1);
    const audit = await f.db.query<{ detail: string }>("select detail from public.audit where action='حذف متدرب نهائيًا' order by created_at desc limit 1");
    expect(audit.rows[0].detail).toContain("برامج: 1");
    expect(audit.rows[0].detail).not.toContain("خالد");
  });

  it("keeps finance immutable outside a purge", async () => {
    const { sub } = await richClient();
    await expect(f.db.query("delete from public.payments where subscription_id=$1", [sub])).rejects.toThrow(/ثابت/);
  });
});

it("exports one trainee's data as JSON and CSV for the coach", async () => {
  const { id } = await richClient("تصدير الاختبار");
  const exported = clientExport(await snapshot(), id)!;
  expect(exported.client.name).toBe("تصدير الاختبار");
  expect(exported.programs).toHaveLength(1);
  expect(exported.payments.length).toBe(2);
  const csv = clientExportCsv(exported);
  expect(csv.startsWith("﻿")).toBe(true);
  expect(csv).toContain("تصدير الاختبار");
  expect(clientExport(await snapshot(other), id)).toBeNull();
});
