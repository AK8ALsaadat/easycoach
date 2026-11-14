import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { coach, other, fixtureDatabase } from "./helpers/db";
import { campaignActive, discountedPrice } from "@/lib/platform/plans";

let fx: Awaited<ReturnType<typeof fixtureDatabase>>;
beforeAll(async () => { fx = await fixtureDatabase({ platformManaged: true }); });
afterAll(async () => { await fx?.db.close(); });
const state = () => fx.call<{ effective_plan: string; status: string; usage: { clients: number }; limits: { clients: number | null } }>(coach, "ec_subscription");

describe("EasyCoach platform billing, distinct from trainee packages", () => {
  it("calculates exact halalas and refuses open-ended campaigns", () => {
    expect([29900,49900,69900].map(discountedPrice)).toEqual([23920,39920,55920]);
    expect(campaignActive({ enabled: true, starts_at: "2026-11-01Z", ends_at: null }, Date.now())).toBe(false);
  });
  it("defaults new owners to Free without a card", async () => {
    expect(await state()).toMatchObject({ effective_plan: "free", status: "free", limits: { clients: 5 } });
  });
  it("serializes concurrent additions at the free limit and permits archiving", async () => {
    for (let i=0;i<4;i++) await fx.client();
    const results = await Promise.allSettled([fx.client(),fx.client()]);
    expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    expect((await state()).usage.clients).toBe(5);
    await expect(fx.client()).rejects.toThrow(/حد المتدربين/);
    const first=(await fx.db.query<{id:string}>("select id from public.clients where coach_id=$1 limit 1",[coach])).rows[0].id;
    await fx.db.query("update public.clients set archived=true where id=$1",[first]);
    await fx.client();
    await expect(fx.db.query("update public.clients set archived=false where id=$1",[first])).rejects.toThrow(/حد المتدربين/);
  });
  it("denies private/import routes, direct writes and other tenant billing", async () => {
    await expect(fx.app(coach,"import_clients",{rows:[],overwrite:false})).rejects.toThrow(/ترقية/);
    await expect(fx.app(coach,"exercise_save",{name:"تمرين خاص",description:"",video:""})).rejects.toThrow(/ترقية/);
    await expect(fx.call(coach,"ec_require",{feature:"branches"})).rejects.toThrow(/ترقية/);
    await expect(fx.call(coach,"ec_confirm_cancel",{owner:other,provider_reference:"fake"})).rejects.toThrow(/permission denied/);
    expect((await fx.call<{ usage:{clients:number} }>(other,"ec_subscription")).usage.clients).toBe(0);
  });
});
