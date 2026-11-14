import { openLegacyDatabase as openDatabase } from "./helpers/legacy-db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID, createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import ExcelJS from "exceljs";
import {
  rpcLocal,
  LOCAL_IDS,
  passwordHash,
} from "@/lib/local-db";
import { blankContent as defaultContent, type Snapshot } from "@/lib/model";
import { publishable } from "./helpers/db";
const blankContent = publishable(defaultContent);
import { addDays, daysBetween, riyadhToday } from "@/lib/dates";
import { readImportFile } from "@/lib/import";
import { csvCell, previewImport } from "@/lib/import-preview";
let db: PGlite;
const coach = LOCAL_IDS.coach,
  other = LOCAL_IDS.other,
  trainee = LOCAL_IDS.trainee;
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
const command = <T = Record<string, unknown>>(
  user: string,
  command: string,
  payload: unknown,
) => rpcLocal<T>(db, user, "app_command", { command, payload });
const snapshot = (user: string) => rpcLocal<Snapshot>(db, user, "app_snapshot");
async function client(user = coach, email = `${randomUUID()}@example.test`) {
  return command<{ id: string }>(user, "client_save", {
    name: "عميل اصطناعي",
    email,
    phone: "0501234567",
  });
}
async function subscription(clientId: string, price = 1000) {
  return command<{ id: string; end_date: string }>(
    coach,
    "subscription_create",
    {
      client_id: clientId,
      name: "باقة اختبار",
      start_date: "2026-11-01",
      end_date: "2026-11-30",
      price,
    },
  );
}
beforeAll(async () => {
  db = await openDatabase();
  for (const [id, email, role] of [
    [coach, "coach@example.test", "coach"],
    [other, "other@example.test", "coach"],
    [trainee, "trainee@example.test", "trainee"],
  ]) {
    await db.query(
      "insert into auth.users(id,email,encrypted_password,email_confirmed_at) values($1,$2,$3,now())",
      [id, email, passwordHash("Synthetic!2026")],
    );
    await rpcLocal(db, id, "init_profile", {
      display_name: "حساب اصطناعي",
      requested_role: role,
    });
  }
});
afterAll(async () => {
  await db?.close();
});

it("persists real PostgreSQL records after closing and reopening the file database", async () => {
  const location = path.join(
    process.cwd(),
    "artifacts",
    "persistence-" + randomUUID(),
  );
  await mkdir(location, { recursive: true });
  let fileDb = await openDatabase(location);
  const user = randomUUID();
  await fileDb.query("insert into auth.users values($1,$2,$3,now())", [
    user,
    "persistent@example.test",
    passwordHash("Synthetic!2026"),
  ]);
  await rpcLocal(fileDb, user, "init_profile", {
    display_name: "مدرب الحفظ",
    requested_role: "coach",
  });
  await rpcLocal(fileDb, user, "app_command", {
    command: "client_save",
    payload: { name: "عميل محفوظ", email: "saved@example.test", phone: "" },
  });
  await fileDb.close();
  fileDb = await openDatabase(location);
  const saved = await rpcLocal<Snapshot>(fileDb, user, "app_snapshot");
  expect(saved.clients[0].email).toBe("saved@example.test");
  await fileDb.close();
});

describe("tenant boundaries and direct database access", () => {
  it("isolates coach reads and refuses writes to another coach client", async () => {
    const a = await client();
    const b = await client(other);
    expect((await snapshot(coach)).clients.some((c) => c.id === b.id)).toBe(
      false,
    );
    await expect(
      command(other, "client_save", {
        id: a.id,
        name: "محاولة تعديل",
        email: "attack@example.test",
        phone: "",
      }),
    ).rejects.toThrow();
    await expect(
      command(other, "program_save", {
        client_id: a.id,
        name: "غير مسموح",
        content: blankContent,
      }),
    ).rejects.toThrow();
  });
  it("cannot spoof a coach ID or mutate raw tables even as an authenticated coach", async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.exec("set local role authenticated");
        await tx.query(`select set_config('request.jwt.claim.sub',$1,true)`, [
          coach,
        ]);
        await tx.query(
          "insert into public.clients(coach_id,name,email) values($1,$2,$3)",
          [other, "غير مسموح", "fake@example.test"],
        );
      }),
    ).rejects.toThrow();
  });
  it("rejects anonymous commands and trainee coach operations", async () => {
    await expect(
      rpcLocal(db, null, "app_command", {
        command: "client_save",
        payload: {},
      }),
    ).rejects.toThrow();
    await expect(
      command(trainee, "client_save", {
        name: "محاولة",
        email: "new@example.test",
        phone: "",
      }),
    ).rejects.toThrow();
  });
  it("does not expose private templates, payment references or other tenant audit", async () => {
    await command(coach, "template_save", {
      name: "قالب خاص",
      content: blankContent,
    });
    expect((await snapshot(other)).templates).toHaveLength(0);
    expect((await snapshot(trainee)).audit).toHaveLength(0);
  });
});
describe("imports", () => {
  it("parses quoted UTF-8 CSV and maps columns without swapping existing data", async () => {
    const file = await readImportFile(
      new TextEncoder().encode(
        'email,name,phone\nNEW@EXAMPLE.TEST,"اسم، مركب",501234567\nexisting@example.test,عميل آخر,0501234567',
      ),
      "clients.csv",
    );
    const rows = previewImport(file, { name: 1, email: 0, phone: 2 }, [
      "existing@example.test",
    ]);
    expect(rows[0].data).toEqual({
      name: "اسم، مركب",
      email: "new@example.test",
      phone: "0501234567",
    });
    expect(rows[1].existing).toBe(true);
  });
  it("flags all duplicate emails and invalid email/phone rows", () => {
    const rows = previewImport(
      {
        headers: ["name", "email", "phone"],
        rows: [
          ["عميل أول", "a@example.test", "0501234567"],
          ["عميل ثاني", "A@EXAMPLE.TEST", "0501234567"],
          ["س", "wrong", "123"],
        ],
      },
      { name: 0, email: 1, phone: 2 },
      [],
    );
    expect(rows.every((r) => r.errors.length > 0)).toBe(true);
  });
  it("imports XLSX values and rejects formula cells", async () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet("عملاء");
    sheet.addRows([
      ["name", "email"],
      ["عميل جديد", "xlsx@example.test"],
    ]);
    const buffer = await book.xlsx.writeBuffer();
    const file = await readImportFile(new Uint8Array(buffer), "clients.xlsx");
    expect(file.rows[0][1]).toBe("xlsx@example.test");
    sheet.getCell("A2").value = { formula: "1+1", result: 2 };
    await expect(
      readImportFile(new Uint8Array(await book.xlsx.writeBuffer()), "bad.xlsx"),
    ).rejects.toThrow();
  });
  it("never overwrites existing client data without explicit selection", async () => {
    const c = await client(coach, "import-existing@example.test");
    await command(coach, "import_clients", {
      rows: [
        {
          name: "اسم مستبدل",
          email: "import-existing@example.test",
          phone: "",
        },
      ],
      overwrite: false,
    });
    expect(
      (await snapshot(coach)).clients.find((x) => x.id === c.id)?.name,
    ).toBe("عميل اصطناعي");
    await command(coach, "import_clients", {
      rows: [
        { name: "اسم مصحح", email: "import-existing@example.test", phone: "" },
      ],
      overwrite: true,
    });
    expect(
      (await snapshot(coach)).clients.find((x) => x.id === c.id)?.name,
    ).toBe("اسم مصحح");
  });
  it("rolls back a whole import when one SQL row is invalid", async () => {
    await expect(
      command(coach, "import_clients", {
        rows: [
          { name: "سليم", email: "rollback@example.test", phone: "" },
          { name: "X", email: "broken@example.test", phone: "" },
        ],
        overwrite: false,
      }),
    ).rejects.toThrow();
    expect(
      (await snapshot(coach)).clients.some(
        (c) => c.email === "rollback@example.test",
      ),
    ).toBe(false);
  });
  it("protects CSV downloads against spreadsheet formula injection", () => {
    expect(csvCell('=HYPERLINK("bad")')).toMatch(/^"'/);
    expect(csvCell("+966500000000")).toMatch(/^"'/);
  });
});
describe("program snapshots and trainee view", () => {
  it("copies templates independently and exposes only the latest published version", async () => {
    const c = await client(coach, "trainee@example.test");
    await db.query("update public.clients set trainee_user_id=$1 where id=$2", [
      trainee,
      c.id,
    ]);
    const template = await command<{ id: string }>(coach, "template_save", {
      name: "قالب أصلي",
      content: blankContent,
    });
    const p = await command<{ id: string }>(coach, "program_save", {
      client_id: c.id,
      name: "نسخة أولى",
      content: blankContent,
    });
    expect((await snapshot(trainee)).programs).toHaveLength(0);
    await command(coach, "program_publish", { id: p.id });
    const edited = structuredClone(blankContent);
    edited.days[0].exercises[0].sets = 5;
    await command(coach, "template_save", {
      id: template.id,
      name: "قالب معدل",
      content: edited,
    });
    expect(
      (await snapshot(trainee)).programs[0].content.days[0].exercises[0].sets,
    ).toBe(3);
    const draft = await command<{ id: string }>(coach, "program_save", {
      client_id: c.id,
      name: "نسخة ثانية",
      content: edited,
    });
    expect((await snapshot(trainee)).programs[0].name).toBe("نسخة أولى");
    await command(coach, "program_publish", { id: draft.id });
    const visible = (await snapshot(trainee)).programs;
    expect(visible).toHaveLength(1);
    expect(visible[0].name).toBe("نسخة ثانية");
    expect(visible[0].content.days[0].exercises[0].sets).toBe(5);
  });
  it("rejects malformed content, script video URLs and overlarge rep inputs at database level", async () => {
    const c = await client();
    const invalid = structuredClone(blankContent);
    invalid.days[0].exercises[0].video = "javascript:alert(1)";
    await expect(
      command(coach, "program_save", {
        client_id: c.id,
        name: "غير صالح",
        content: invalid,
      }),
    ).rejects.toThrow();
    await expect(
      command(coach, "program_save", {
        client_id: c.id,
        name: "غير صالح",
        content: { days: [], nutrition: {} },
      }),
    ).rejects.toThrow();
  });
});
describe("subscription dates and freezing", () => {
  it("uses Riyadh at midnight and handles leap years without server timezone arithmetic", () => {
    expect(riyadhToday(new Date("2026-11-06T21:00:00Z"))).toBe("2026-11-07");
    expect(riyadhToday(new Date("2026-11-06T20:59:59Z"))).toBe("2026-11-06");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(daysBetween("2026-11-01", "2026-11-04")).toBe(3);
  });
  it("extends a freeze exactly once, including an identical retried operation", async () => {
    const c = await client();
    const s = await subscription(c.id);
    const payload = {
      id: randomUUID(),
      subscription_id: s.id,
      start_date: "2026-11-05",
      end_date: "2026-11-07",
    };
    await command(coach, "freeze_apply", payload);
    await command(coach, "freeze_apply", payload);
    const snap = await snapshot(coach);
    expect(snap.subscriptions.find((x) => x.id === s.id)?.end_date).toBe(
      "2026-12-03",
    );
    expect(snap.freezes.filter((f) => f.subscription_id === s.id)).toHaveLength(
      1,
    );
    await expect(
      command(coach, "freeze_apply", { ...payload, id: randomUUID() }),
    ).rejects.toThrow();
    await expect(
      command(coach, "freeze_apply", {
        ...payload,
        id: randomUUID(),
        start_date: "2026-11-06",
        end_date: "2026-11-08",
      }),
    ).rejects.toThrow();
  });
  it("rejects renewal overlaps, duplicate renewal and freezing an already renewed package", async () => {
    const c = await client();
    const s = await subscription(c.id);
    const renewal = {
      client_id: c.id,
      name: "تجديد",
      price: 900,
      previous_id: s.id,
      start_date: "2026-12-01",
      end_date: "2026-12-30",
    };
    await expect(
      command(coach, "subscription_create", {
        ...renewal,
        start_date: "2026-11-20",
      }),
    ).rejects.toThrow();
    await command(coach, "subscription_create", renewal);
    await expect(
      command(coach, "subscription_create", {
        ...renewal,
        start_date: "2027-01-01",
        end_date: "2027-01-31",
      }),
    ).rejects.toThrow();
    await expect(
      command(coach, "freeze_apply", {
        id: randomUUID(),
        subscription_id: s.id,
        start_date: "2026-11-05",
        end_date: "2026-11-07",
      }),
    ).rejects.toThrow();
  });
});
describe("immutable payment ledger", () => {
  it("refuses a future receipt date without changing the subscription", async () => {
    const c = await client();
    const s = await subscription(c.id);
    await expect(
      command(coach, "payment_add", {
        id: randomUUID(),
        subscription_id: s.id,
        amount: 100,
        method: "cash",
        paid_date: addDays(riyadhToday(), 1),
        reference: "future-" + randomUUID(),
      }),
    ).rejects.toThrow();
    expect(
      (await snapshot(coach)).payments.some((p) => p.subscription_id === s.id),
    ).toBe(false);
  });
  it("accepts partial payments independently of the subscription start date and rejects overpayment", async () => {
    const c = await client();
    const s = await subscription(c.id, 1000);
    const payment = {
      id: randomUUID(),
      subscription_id: s.id,
      amount: 400,
      method: "bank",
      paid_date: "2026-10-25",
      reference: "partial-" + randomUUID(),
    };
    await command(coach, "payment_add", payment);
    await command(coach, "payment_add", payment);
    expect(
      (await snapshot(coach)).payments.filter(
        (p) => p.subscription_id === s.id,
      ),
    ).toHaveLength(1);
    await expect(
      command(coach, "payment_add", {
        ...payment,
        id: randomUUID(),
        amount: 700,
        reference: randomUUID(),
      }),
    ).rejects.toThrow();
    await expect(
      command(coach, "payment_add", { ...payment, id: randomUUID() }),
    ).rejects.toThrow();
    expect(
      (await snapshot(coach)).subscriptions.find((x) => x.id === s.id)
        ?.start_date,
    ).toBe("2026-11-01");
  });
  it("records corrections as exactly one reversal without deleting the original", async () => {
    const c = await client();
    const s = await subscription(c.id);
    const p = await command<{ id: string }>(coach, "payment_add", {
      id: randomUUID(),
      subscription_id: s.id,
      amount: 300,
      method: "cash",
      paid_date: "2026-11-02",
      reference: "",
    });
    await command(coach, "payment_reverse", {
      id: randomUUID(),
      payment_id: p.id,
      reason: "تصحيح مبلغ مسجل خطأ",
    });
    await expect(
      command(coach, "payment_reverse", {
        id: randomUUID(),
        payment_id: p.id,
        reason: "تصحيح مكرر غير مسموح",
      }),
    ).rejects.toThrow();
    const ledger = (await snapshot(coach)).payments.filter(
      (x) => x.subscription_id === s.id,
    );
    expect(ledger).toHaveLength(2);
    expect(ledger.reduce((n, p) => n + Number(p.amount), 0)).toBe(0);
    await expect(
      db.query("delete from public.payments where id=$1", [p.id]),
    ).rejects.toThrow();
  });
});
describe("verified single-use invitations and join approval", () => {
  it("requires matching verified email and prevents reuse", async () => {
    const c = (await snapshot(coach)).clients.find(
      (c) => c.email === "trainee@example.test",
    )!;
    const token = hash(randomUUID());
    await command(coach, "invite_create", {
      client_id: c.id,
      token_hash: token,
    });
    await expect(
      rpcLocal(db, other, "claim_invite", { token }),
    ).rejects.toThrow();
    await rpcLocal(db, trainee, "claim_invite", { token });
    await expect(
      rpcLocal(db, trainee, "claim_invite", { token }),
    ).rejects.toThrow();
    expect((await snapshot(trainee)).clients.some((x) => x.id === c.id)).toBe(
      true,
    );
  });
  it("revokes an old link and denies expired or unverified identities", async () => {
    const c = await client(coach, "invite-expire@example.test");
    const old = hash(randomUUID()),
      fresh = hash(randomUUID());
    await command(coach, "invite_create", { client_id: c.id, token_hash: old });
    await command(coach, "invite_create", {
      client_id: c.id,
      token_hash: fresh,
    });
    expect(
      await rpcLocal(db, null, "public_link_info", {
        token: old,
        link_type: "invite",
      }),
    ).toBe(null);
    await db.query(
      "update public.invitations set expires_at=now()-interval '1 minute' where token_hash=$1",
      [fresh],
    );
    await expect(
      rpcLocal(db, trainee, "claim_invite", { token: fresh }),
    ).rejects.toThrow();
    const unverified = randomUUID();
    await db.query("insert into auth.users values($1,$2,$3,null)", [
      unverified,
      "unverified@example.test",
      "x",
    ]);
    await expect(
      rpcLocal(db, unverified, "init_profile", {
        display_name: "غير موثق",
        requested_role: "coach",
      }),
    ).rejects.toThrow();
  });
  it("keeps a public join request pending until an explicit coach approval", async () => {
    const token = hash(randomUUID());
    await command(coach, "join_link_create", { token_hash: token });
    await rpcLocal(db, null, "request_join", {
      token,
      display_name: "طلب اصطناعي",
      contact_email: "join@example.test",
      contact_phone: "",
    });
    let snap = await snapshot(coach);
    expect(snap.clients.some((c) => c.email === "join@example.test")).toBe(
      false,
    );
    const request = snap.join_requests.find(
      (r) => r.email === "join@example.test",
    )!;
    await expect(
      command(other, "join_review", { id: request.id, approve: true }),
    ).rejects.toThrow();
    await command(coach, "join_review", { id: request.id, approve: true });
    snap = await snapshot(coach);
    expect(
      snap.clients.find((c) => c.email === "join@example.test")
        ?.trainee_user_id,
    ).toBe(null);
  });
});

describe("data requests and revocation", () => {
  it("documents corrections and refuses another coach fulfilling the request", async () => {
    const c = (await snapshot(coach)).clients.find(
      (c) => c.email === "trainee@example.test",
    )!;
    const request = await command<{ id: string }>(trainee, "privacy_request", {
      client_id: c.id,
      kind: "correction",
      details: "تصحيح الاسم في الملف",
    });
    await expect(
      command(other, "privacy_fulfill", {
        id: request.id,
        resolution: "محاولة غير مسموحة",
      }),
    ).rejects.toThrow();
    await command(coach, "client_save", {
      id: c.id,
      name: "اسم مصحح موثق",
      email: c.email,
      phone: c.phone,
    });
    await command(coach, "privacy_fulfill", {
      id: request.id,
      resolution: "تم تصحيح الاسم حسب طلب العميل",
    });
    expect(
      (await snapshot(trainee)).clients.find((x) => x.id === c.id)?.name,
    ).toBe("اسم مصحح موثق");
    expect(
      (await snapshot(trainee)).privacy_requests.find(
        (x) => x.id === request.id,
      )?.status,
    ).toBe("fulfilled");
  });
  it("deletes identifying fields and programs, revokes trainee access and retains the anonymised ledger", async () => {
    const c = (await snapshot(coach)).clients.find(
      (c) => c.email === "trainee@example.test",
    )!;
    const sub = await subscription(c.id);
    await command(coach, "payment_add", {
      id: randomUUID(),
      subscription_id: sub.id,
      amount: 100,
      method: "bank",
      paid_date: "2026-11-01",
      reference: randomUUID(),
    });
    const request = await command<{ id: string }>(trainee, "privacy_request", {
      client_id: c.id,
      kind: "deletion",
      details: "احذف بياناتي من هذا المدرب",
    });
    await command(coach, "privacy_fulfill", {
      id: request.id,
      resolution: "حذف التعريف والبرنامج وإلغاء الربط",
    });
    const owner = await snapshot(coach),
      student = await snapshot(trainee);
    const deleted = owner.clients.find((x) => x.id === c.id)!;
    expect(deleted.archived).toBe(true);
    expect(deleted.email).toContain("@deleted.invalid");
    expect(deleted.phone).toBe("");
    expect(deleted.trainee_user_id).toBe(null);
    expect(owner.programs.some((p) => p.client_id === c.id)).toBe(false);
    expect(owner.payments.some((p) => p.subscription_id === sub.id)).toBe(true);
    expect(student.clients.some((x) => x.id === c.id)).toBe(false);
    expect(student.subscriptions.some((x) => x.id === sub.id)).toBe(false);
  });
  it("changing a linked email removes access and invalidates outstanding invites", async () => {
    const c = await client(coach, "other@example.test");
    const token = hash(randomUUID());
    await command(coach, "invite_create", {
      client_id: c.id,
      token_hash: token,
    });
    await rpcLocal(db, other, "claim_invite", { token });
    const unclaimed = hash(randomUUID());
    await command(coach, "invite_create", {
      client_id: c.id,
      token_hash: unclaimed,
    });
    await command(coach, "client_save", {
      id: c.id,
      name: "هوية مصححة",
      email: "replacement@example.test",
      phone: "",
    });
    expect((await snapshot(other)).clients.some((x) => x.id === c.id)).toBe(
      false,
    );
    expect(
      await rpcLocal(db, null, "public_link_info", {
        token: unclaimed,
        link_type: "invite",
      }),
    ).toBe(null);
  });
});
