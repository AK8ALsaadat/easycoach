import "server-only";
import { cookies } from "next/headers";
import { z } from "zod";
import { hash, rpc } from "./server";

export const sessionCookieName = (portalId: string) => "ec_trainee_" + portalId.replaceAll("-", "");
export const bearerProof = (token: string) => hash("EasyCoach/bearer/v1:" + token);

export async function resolvePortalMediaCredential(key: string) {
  z.string().regex(/^[a-f0-9]{64}$/).parse(key);
  const info = await rpc<{ id: string; mode: string } | null>("portal_transport_info", { token_hash: key }, true);
  if (!info) throw Error("الرابط غير متاح");
  if (info.mode === "bearer") {
    const context = await resolvePortalCredential("session:" + info.id);
    if (context.key !== key) throw Error("الرابط غير متاح");
    return context;
  }
  const proof = (await cookies()).get("ec_portal_" + key.slice(0, 12))?.value;
  if (!proof) throw Error("أدخل رمز الدخول من مدربك");
  return { key, proof };
}

export async function resolvePortalCredential(reference: string, pin?: string): Promise<{ key: string; proof: string }> {
  const jar = await cookies();
  if (reference.startsWith("session:")) {
    const portalId = z.string().uuid().parse(reference.slice(8));
    const session = jar.get(sessionCookieName(portalId))?.value;
    if (!session || !/^[a-f0-9]{64}$/.test(session)) throw Error("انتهت جلسة الرابط. افتح رابط مدربك من جديد");
    const context = await rpc<{ key: string; proof: string } | null>("portal_session_context", { portal_id: portalId, session_hash: hash(session) }, true);
    if (!context) throw Error("انتهت جلسة الرابط. افتح رابط مدربك من جديد");
    return context;
  }
  const token = z.string().regex(/^[a-f0-9]{64}$/).parse(reference);
  const key = hash(token);
  const proof = pin ? hash(token + ":" + z.string().regex(/^\d{6}$/).parse(pin)) : jar.get("ec_portal_" + key.slice(0, 12))?.value;
  if (!proof) throw Error("أدخل رمز الدخول من مدربك");
  return { key, proof };
}
