import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { getLocalDatabase, rpcLocal } from "./local-db";
import type { Snapshot } from "./model";
import type { Database } from "@/types/supabase";

export const localMode = () => process.env.APP_MODE === "local";
export const hash = (v: string) => createHash("sha256").update(v).digest("hex");
export function safeNext(value: unknown) {
  return typeof value === "string" &&
    /^\/(coach(?:\/[^\\]*)?|me|invite\/[a-f0-9]{64})$/.test(value)
    ? value
    : "/coach";
}
export async function localGuard() {
  const h = await headers();
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(h.get("host") ?? ""))
    throw new Error("المعاينة المحلية متاحة على الجهاز فقط");
}
export async function supabase() {
  const jar = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key)
    throw new Error("اضبط اتصال Supabase أو شغّل وضع المعاينة المحلية");
  return createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (items) => {
        try {
          items.forEach((c) =>
            jar.set(c.name, c.value, {
              ...c.options,
              httpOnly: true,
              sameSite: "lax",
              secure: process.env.APP_URL?.startsWith("https://") ?? false,
            }),
          );
        } catch {
          /* Proxy refreshes cookies on ordinary reads. */
        }
      },
    },
  });
}
export async function actor() {
  if (localMode()) {
    await localGuard();
    const token = (await cookies()).get("ec_session")?.value;
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const db = await getLocalDatabase();
    const r = await db.query<{ id: string; email: string }>(
      `select u.id,u.email from auth.users u join private.local_sessions s on s.user_id=u.id where s.token_hash=$1 and s.expires_at>now() and u.email_confirmed_at is not null`,
      [hash(token)],
    );
    return r.rows[0] ? { ...r.rows[0], name: "", role: "trainee" } : null;
  }
  const client = await supabase();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user?.email_confirmed_at) return null;
  return {
    id: data.user.id,
    email: data.user.email!,
    name: String(data.user.user_metadata.display_name ?? "مستخدم جديد"),
    role: data.user.user_metadata.role === "coach" ? "coach" : "trainee",
  };
}
export async function rpc<T>(
  name: string,
  args: Record<string, unknown> = {},
  anonymous = false,
): Promise<T> {
  const user = await actor();
  if (!anonymous && !user) throw new Error("يلزم تسجيل الدخول");
  if (localMode())
    return rpcLocal<T>(await getLocalDatabase(), user?.id ?? null, name, args);
  type Functions = Database["public"]["Functions"];
  const { data, error } = await (
    await supabase()
  ).rpc(name as keyof Functions, args as Functions[keyof Functions]["Args"]);
  if (error)
    throw Object.assign(new Error(error.message), { code: error.code });
  return data as T;
}
export async function snapshot(): Promise<Snapshot> {
  const user = await actor();
  if (!user) redirect("/login");
  let data = await rpc<Snapshot>("management_snapshot");
  if (!data.profile) {
    await rpc("init_profile", {
      display_name: user.name || "مستخدم جديد",
      requested_role: user.role,
    });
    data = await rpc<Snapshot>("management_snapshot");
  }
  return data;
}
export async function requireCoach() {
  const data = await snapshot();
  if (data.profile?.role !== "coach") throw new Error("هذه الصفحة للمدرب فقط");
  return data;
}
export async function loginLocal(email: string, password: string) {
  await localGuard();
  const db = await getLocalDatabase();
  const h = await headers();
  const rateKey = hash(
    "login:" + email + ":" + (h.get("x-forwarded-for") ?? "loopback"),
  );
  const limits = await db.query<{ attempts: number }>(
    `insert into private.rate_limits(key,attempts) values($1,1) on conflict(key) do update set attempts=case when private.rate_limits.window_start<now()-interval '15 minutes' then 1 else private.rate_limits.attempts+1 end,window_start=case when private.rate_limits.window_start<now()-interval '15 minutes' then now() else private.rate_limits.window_start end returning attempts`,
    [rateKey],
  );
  if (limits.rows[0].attempts > 10)
    throw new Error("محاولات كثيرة. انتظر 15 دقيقة");
  const r = await db.query<{ id: string; encrypted_password: string }>(
    "select id,encrypted_password from auth.users where email=$1",
    [email],
  );
  const user = r.rows[0];
  const [salt, stored] = (
    user?.encrypted_password ?? "0".repeat(32) + ":" + "0".repeat(128)
  ).split(":");
  if (
    !timingSafeEqual(
      Buffer.from(stored, "hex"),
      scryptSync(password, salt, 64),
    ) ||
    !user
  )
    throw new Error("الإيميل أو كلمة المرور غير صحيحة");
  const token = randomBytes(32).toString("hex");
  const jar = await cookies();
  const old = jar.get("ec_session")?.value;
  if (old)
    await db.query("delete from private.local_sessions where token_hash=$1", [
      hash(old),
    ]);
  await db.query(
    `insert into private.local_sessions(token_hash,user_id,expires_at) values($1,$2,now()+interval '7 days')`,
    [hash(token), user.id],
  );
  jar.set("ec_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 7 * 86400,
  });
}
export function readableError(error: unknown) {
  const e = error as { message?: string; code?: string };
  if (e.code === "23505")
    return "السجل مكرر أو العملية مطبقة سابقًا. راجع البيانات والمرجع.";
  if (e.code === "23503" || e.code === "42501")
    return "السجل غير متاح لهذا الحساب.";
  if (e.message && /[\u0600-\u06ff]/.test(e.message))
    return e.message.slice(0, 250);
  return "لم تكتمل العملية. راجع المدخلات وحاول مرة أخرى.";
}
