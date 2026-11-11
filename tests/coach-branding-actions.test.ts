import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { openDatabase, rpcLocal, LOCAL_IDS } from "@/lib/local-db";
import type { CoachBranding } from "@/lib/coach-branding";
const context = vi.hoisted(() => ({ db: null as import("@electric-sql/pglite").PGlite | null, user: "11111111-1111-4111-8111-111111111111" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/server", () => ({
  rpc: (name: string, args: Record<string, unknown>) => rpcLocal(context.db!, context.user, name, args),
  requireCoach: async () => {
    const result = await context.db!.query<{ role: string }>("select role from public.profiles where id=$1", [context.user]);
    if (result.rows[0]?.role !== "coach") throw Error("هذه الإعدادات للمدرب فقط");
  },
  readableError: (error: unknown) => (error as Error).message,
}));
import { saveCoachBranding } from "@/app/branding-actions";

beforeAll(async () => {
  context.db = await openDatabase();
  for (const [uid, role] of [[LOCAL_IDS.coach, "coach"], [LOCAL_IDS.trainee, "trainee"]]) {
    await context.db.query("insert into auth.users values($1,$2,'synthetic',now())", [uid, uid + "@example.test"]);
    await rpcLocal(context.db, uid, "init_profile", { display_name: "الاسم الأصلي", requested_role: role });
  }
});
afterAll(async () => { await context.db?.close(); });
const form = (name: string, version = "") => {
  const result = new FormData();
  result.set("display_name", name); result.set("version", version); result.set("remove_avatar", "false");
  return result;
};

it("saves real form data and accepts the returned PostgreSQL timestamp for the next edit", async () => {
  const first = await saveCoachBranding(form("الاسم الأول"));
  expect(first.ok).toBe(true);
  expect(first.branding?.updated_at).toBeTruthy();
  const second = await saveCoachBranding(form("الاسم الثاني", first.branding!.updated_at!));
  expect(second.ok).toBe(true);
  const stored = await rpcLocal<CoachBranding[]>(context.db!, context.user, "coach_branding_snapshot");
  expect(stored[0].name).toBe("الاسم الثاني");
  expect((await saveCoachBranding(form("تعديل قديم", first.branding!.updated_at!))).ok).toBe(false);
});

it("keeps saved data on corrupt upload and reports a useful error instead of success", async () => {
  const before = (await rpcLocal<CoachBranding[]>(context.db!, context.user, "coach_branding_snapshot"))[0];
  const upload = form("لا تحفظ هذا التعديل", before.updated_at!);
  upload.set("avatar", new File(["not a jpeg"], "portrait.jpg", { type: "image/jpeg" }));
  const result = await saveCoachBranding(upload);
  expect(result.ok).toBe(false);
  expect(result.message).toContain("تعذر معالجة الصورة");
  expect((await rpcLocal<CoachBranding[]>(context.db!, context.user, "coach_branding_snapshot"))[0]).toEqual(before);
});

it("blocks the settings action for a trainee", async () => {
  context.user = LOCAL_IDS.trainee;
  expect((await saveCoachBranding(form("متدرب"))).ok).toBe(false);
});
