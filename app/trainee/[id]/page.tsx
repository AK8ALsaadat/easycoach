import { z } from "zod";
import { notFound } from "next/navigation";
import { ClientPortal } from "@/components/client-portal";
import { Brand } from "@/components/brand";
import { resolvePortalCredential } from "@/lib/portal-credentials";
import { rpc } from "@/lib/server";
import type { CoachBranding } from "@/lib/coach-branding";
export const metadata = { title: "بوابة المتدرب", referrer: "no-referrer" as const, robots: { index: false, follow: false, noarchive: true } };
export default async function TraineeSession({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!z.string().uuid().safeParse(id).success) notFound();
  try { await resolvePortalCredential("session:" + id); }
  catch { return <main className="mx-auto max-w-lg px-5 py-10"><Brand /><section className="card mt-10 p-6"><h1>افتح رابط مدربك</h1><p className="mt-4 text-sm leading-8">انتهت جلسة الدخول أو الرابط غير متاح. افتح الرابط الأصلي الذي أرسله مدربك؛ لا يلزم حساب.</p></section></main>; }
  const branding = await rpc<CoachBranding | null>("public_portal_branding", { portal_id: id }, true);
  return <ClientPortal key={id} token={"session:" + id} branding={branding} />;
}
