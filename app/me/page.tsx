import { snapshot, rpc } from "@/lib/server";
import Link from "next/link";
import { portalTheme } from "@/lib/platform/portal-theme";
import type { CSSProperties } from "react";
import { paylinkReadyCoaches } from "@/lib/paylink/service";
import { Trainee } from "@/components/trainee";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { LegalLinks } from "@/components/legal-links";
export default async function MePage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const data = await snapshot();
  const selectedId = (await searchParams).client;
  if (data.profile?.role === "coach" && selectedId) redirect(`/coach/clients/${encodeURIComponent(selectedId)}/preview`);
  const coachIds = data.clients.filter((c) => c.trainee_user_id === data.profile?.id && !c.archived).map((c) => c.coach_id);
  const own = data.clients.filter(c => c.trainee_user_id === data.profile?.id && !c.archived);
  const client = own.find(c => c.id === selectedId) ?? own[0];
  if (client && !(await rpc<string[]>("ec_client_features", { client: client.id })).includes("programs")) {
    const packages = await rpc<{id:string;name:string;attended:number;remaining:number|null;end_date:string;attendance:string[]}[]>("ec_attendance_page",{client:client.id});
    return <main dir="rtl" className="legal-page"><Brand /><header><h1>رصيد الحصص والحضور</h1><p className="mt-3 text-muted">أهلًا {client.name}، تابع رصيد باقتك وسجل حضورك مع مدربك.</p></header><nav className="flex flex-wrap gap-3" aria-label="ملفاتك التدريبية">{own.map(c=><Link key={c.id} className="btn-secondary" href={`/me?client=${c.id}`}>{c.name}</Link>)}</nav>{packages.map(pkg=><section className="card p-5 space-y-3" key={pkg.id}><h2>{pkg.name}</h2><p>الحضور: {pkg.attended} · المتبقي: {pkg.remaining??"لم يحدد عدد الحصص"}</p><p>الانتهاء: {pkg.end_date}</p><details><summary>سجل الحضور</summary><ul>{pkg.attendance.map(day=><li key={day}>{day}</li>)}</ul></details></section>)}{!packages.length && <p className="card p-5 text-muted">لم يضف مدربك باقة حصص بعد. تواصل معه لمعرفة موعد البداية.</p>}<Link href="/logout" className="btn">تسجيل الخروج</Link><LegalLinks /></main>;
  }
  const paylinkCoaches = await paylinkReadyCoaches(coachIds);
  const color=client?await rpc<string|null>("ec_client_color",{client:client.id}):null;
  return <div style={portalTheme(color) as CSSProperties}><Trainee data={data} selectedId={selectedId} paylinkCoaches={paylinkCoaches} /></div>;
}
