import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { rpcLocal } from "@/lib/local-db";
import { coach, fixtureDatabase, other } from "./helpers/db";

/** The SQL side of Paylink: what a trainee may pay, settling exactly once, and isolation. */

let fx: Awaited<ReturnType<typeof fixtureDatabase>>;
let db: PGlite;

const sql = async <T>(text: string, values: unknown[] = []) => (await db.query<{ r: T }>(text, values)).rows[0].r;
const context = (traineeId: string, sub: string) =>
  sql<Record<string, unknown> | null>("select public.paylink_checkout_context(trainee=>$1,subscription=>$2) as r", [traineeId, sub]);
const open = (owner: string, sub: string, client: string, order: string, total: number) =>
  sql<string>("select public.paylink_invoice_open(coach=>$1,subscription=>$2,client=>$3,order_no=>$4,total=>$5) as r", [owner, sub, client, order, total]);
const attach = (order: string, tx: string) =>
  sql("select public.paylink_invoice_attach(order_no=>$1,transaction=>$2,url=>$3) as r", [order, tx, `https://payment.paylink.sa/pay/info/${tx}`]);
const settle = (tx: string, amount: number) =>
  sql<{ outcome: string; reason?: string }>("select public.paylink_invoice_settle(transaction=>$1,paid_amount=>$2,method_type=>'mada') as r", [tx, amount]);

let seq = 0;
const orderNo = () => `EC-TEST${String(++seq).padStart(4, "0")}-ABCD`;

async function setup(price = 300) {
  const traineeId = await fx.newTrainee();
  const clientId = await fx.client();
  await fx.linkTrainee(clientId, traineeId);
  const sub = await fx.app<{ id: string }>(coach, "subscription_create", {
    client_id: clientId,
    name: "باقة شهرية",
    start_date: "2026-11-01",
    end_date: "2026-11-30",
    price,
  });
  return { traineeId, clientId, subId: sub.id };
}

beforeAll(async () => {
  fx = await fixtureDatabase();
  db = fx.db;
});

describe("paylink checkout context", () => {
  it("shows a trainee only their own subscription and what is still owed", async () => {
    const { traineeId, subId } = await setup(300);
    await fx.app(coach, "payment_add", { id: crypto.randomUUID(), subscription_id: subId, amount: 100, method: "cash", paid_date: "2026-11-02", reference: "" });
    const ctx = await context(traineeId, subId);
    expect(ctx).toMatchObject({ coach_id: coach, outstanding: 200, subscription_name: "باقة شهرية" });

    const stranger = await fx.newTrainee();
    expect(await context(stranger, subId)).toBeNull();
  });

  it("hides an archived client's subscription", async () => {
    const { traineeId, clientId, subId } = await setup();
    await db.query("update public.clients set archived=true where id=$1", [clientId]);
    expect(await context(traineeId, subId)).toBeNull();
  });
});

describe("paylink settlement", () => {
  it("records one paylink payment per transaction, however many times it is confirmed", async () => {
    const { clientId, subId } = await setup(300);
    const order = orderNo();
    await open(coach, subId, clientId, order, 300);
    await attach(order, "9100000000001");
    expect((await settle("9100000000001", 300)).outcome).toBe("activated");
    expect((await settle("9100000000001", 300)).outcome).toBe("duplicate");
    const rows = await db.query<{ method: string; amount: string; reference: string }>(
      "select method,amount,reference from public.payments where subscription_id=$1",
      [subId],
    );
    expect(rows.rows).toEqual([{ method: "paylink", amount: "300.00", reference: "paylink:9100000000001" }]);
  });

  it("holds a payment whose amount differs from the invoice for review instead of applying it", async () => {
    const { clientId, subId } = await setup(300);
    const order = orderNo();
    await open(coach, subId, clientId, order, 300);
    await attach(order, "9100000000002");
    expect(await settle("9100000000002", 30)).toMatchObject({ outcome: "review", reason: "amount_mismatch" });
    expect((await db.query("select 1 from public.payments where subscription_id=$1", [subId])).rows).toHaveLength(0);
    // Stays in review: a later confirmation does not apply it either.
    expect((await settle("9100000000002", 300)).outcome).toBe("review");
  });

  it("never pays a subscription beyond its price (two invoices both paid)", async () => {
    const { clientId, subId } = await setup(300);
    const [a, b] = [orderNo(), orderNo()];
    await open(coach, subId, clientId, a, 300);
    await attach(a, "9100000000003");
    await open(coach, subId, clientId, b, 300);
    await attach(b, "9100000000004");
    expect((await settle("9100000000003", 300)).outcome).toBe("activated");
    expect(await settle("9100000000004", 300)).toMatchObject({ outcome: "review", reason: "exceeds_balance" });
  });

  it("limits invoices per subscription per hour", async () => {
    const { clientId, subId } = await setup(300);
    for (let i = 0; i < 6; i++) await open(coach, subId, clientId, orderNo(), 300);
    await expect(open(coach, subId, clientId, orderNo(), 300)).rejects.toThrow(/Too many invoices/);
  });

  it("rejects an invoice for another coach's subscription", async () => {
    const { clientId, subId } = await setup();
    await expect(open(other, subId, clientId, orderNo(), 300)).rejects.toThrow();
  });

  it("does not move a paid invoice back to pending or canceled", async () => {
    const { clientId, subId } = await setup(300);
    const order = orderNo();
    await open(coach, subId, clientId, order, 300);
    await attach(order, "9100000000005");
    await settle("9100000000005", 300);
    await sql("select public.paylink_invoice_mark(transaction=>'9100000000005',next_status=>'canceled',errors=>'[]'::jsonb) as r");
    expect((await db.query<{ status: string }>("select status from public.paylink_invoices where transaction_no='9100000000005'")).rows[0].status).toBe("paid");
  });
});

describe("paylink and permanent client deletion", () => {
  it("removes the client's invoices with them, paid or not", async () => {
    const { clientId, subId } = await setup(300);
    const [paid, pending] = [orderNo(), orderNo()];
    await open(coach, subId, clientId, paid, 150);
    await attach(paid, "9100000000009");
    await settle("9100000000009", 150);
    await open(coach, subId, clientId, pending, 150);
    await db.query("update public.clients set name='حذف الدفع' where id=$1", [clientId]);
    await fx.manage(coach, "client_archive", { client_id: clientId, archived: true });
    await fx.call(coach, "client_purge", { target: clientId, confirm_name: "حذف الدفع" });
    const left = await db.query("select 1 from public.paylink_invoices where client_id=$1", [clientId]);
    expect(left.rows).toHaveLength(0);
  });
});

describe("paylink isolation", () => {
  it("lets coaches and trainees read only their own invoices, and nobody call the server functions", async () => {
    const { traineeId, clientId, subId } = await setup(300);
    const order = orderNo();
    await open(coach, subId, clientId, order, 300);
    const visible = async (user: string) => {
      return db.transaction(async (tx) => {
        await tx.exec("set local role authenticated");
        await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
        return (await tx.query("select order_number from public.paylink_invoices where order_number=$1", [order])).rows.length;
      });
    };
    expect(await visible(coach)).toBe(1);
    expect(await visible(traineeId)).toBe(1);
    expect(await visible(other)).toBe(0);
    expect(await visible(await fx.newTrainee())).toBe(0);

    await expect(rpcLocal(db, traineeId, "paylink_invoice_settle", { transaction: "x", paid_amount: 1, method_type: null })).rejects.toThrow(/permission denied/);
    await expect(rpcLocal(db, coach, "paylink_account_get", { coach })).rejects.toThrow(/permission denied/);
    await expect(rpcLocal(db, null, "paylink_checkout_context", { trainee: traineeId, subscription: subId })).rejects.toThrow(/permission denied/);
    await expect(
      db.transaction(async (tx) => {
        await tx.exec("set local role authenticated");
        await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [coach]);
        await tx.query("update public.paylink_invoices set status='paid' where order_number=$1", [order]);
      }),
    ).rejects.toThrow(/permission denied/);
  });

  it("stores sealed keys out of reach of every app role", async () => {
    await sql("select public.paylink_account_put(coach=>$1,sealed=>$2) as r", [coach, "v1." + "x".repeat(60)]);
    expect(await sql("select public.paylink_ready_coaches(coaches=>$1) as r", [`{${coach},${other}}`])).toEqual([coach]);
    await expect(
      db.transaction(async (tx) => {
        await tx.exec("set local role authenticated");
        await tx.query("select * from private.paylink_accounts");
      }),
    ).rejects.toThrow(/permission denied/);
    await sql("select public.paylink_account_put(coach=>$1,sealed=>null) as r", [coach]);
    expect(await sql("select public.paylink_account_get(coach=>$1) as r", [coach])).toBeNull();
  });
});
