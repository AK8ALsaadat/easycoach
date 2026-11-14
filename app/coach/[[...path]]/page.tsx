import { redirect, notFound } from "next/navigation";
import { cookies } from "next/headers";
import { snapshot, localMode, rpc } from "@/lib/server";
import Link from "next/link";
import { Workspace } from "@/components/workspace";
import { z } from "zod";
import { platformState, platformQuote } from "@/lib/platform/server";
import type { PlatformState } from "@/lib/platform/plans";
export default async function CoachPage({
  params,
  searchParams,
}: {
  params: Promise<{ path?: string[] }>;
  searchParams: Promise<{
    filter?: string;
    add?: string;
    q?: string;
    tab?: string;
    template?: string;
    after?: string;
    template_after?: string;
    exercise_after?: string;
    trial?: string;
  }>;
}) {
  const { path = [] } = await params;
  const search = await searchParams;
  const validId=(value?:string)=>z.uuid().safeParse(value).success?value:null;
  const data = await snapshot({target:validId(path[1]),after_client:validId(search.after),after_template:validId(search.template_after),after_exercise:validId(search.exercise_after),search_text:(search.q??"").slice(0,120)});
  if (data.profile?.role !== "coach") redirect("/me");
  // Platform plan for the header pill; a failure here must never block the workspace.
  const platform: (PlatformState & { trial_offer: boolean }) | null = await platformState()
    .then(async state => ({ ...state, trial_offer: state.mode === "managed" && !state.trial_used_at && (state.status === "free" || state.status === "expired") && (await platformQuote("pro").then(q => q.trial_available).catch(() => false)) }))
    .catch(() => null);
  const preferences = await cookies();
  const tutorialDismissed =
    preferences.get("ec_coach_tutorial")?.value === data.profile.id;
  const section = path[0] ?? "today";
  const isSupportOwner = Boolean(process.env.SUPPORT_OWNER_USER_ID && process.env.SUPPORT_OWNER_USER_ID === data.profile?.id);
  const editing = section === "clients" && path.length === 3 && path[2] === "edit";
  const feature = section === "library" ? "exercises" : editing ? "programs" : null;
  if (feature) {
    let allowed = false;
    try { allowed = await rpc<boolean>("ec_require", { feature }); } catch {}
    if (!allowed) return <main dir="rtl" className="plans-page plans-page-narrow"><section className="confirm-card"><p className="eyebrow">ميزة من الباقات المدفوعة</p><h1>{feature === "programs" ? "البرامج التدريبية" : "مكتبة التمارين والقوالب"}</h1><p className="text-muted">هذه الميزة متاحة ابتداءً من الباقة الأساسية. باقتك المجانية تشمل الملفات وباقات الحصص والحضور.</p><div className="flex flex-wrap gap-3">{platform?.trial_offer ? <Link href="/start" className="btn">ابدأ 14 يومًا مجانًا</Link> : <Link href="/pricing" className="btn">مقارنة الباقات</Link>}<Link href="/coach" className="btn-secondary">العودة لمساحة المدرب</Link></div></section></main>;
  }
  if (
    (!["today", "clients", "library", "finance", "settings"].includes(section) && !(section === "support" && isSupportOwner)) ||
    path.length > 3 ||
    (path.length === 3 && !editing) ||
    (path.length >= 2 && section !== "clients")
  )
    notFound();
  const pageLink=(key:string,value:string)=>{
    const next=new URLSearchParams();if(search.q)next.set("q",search.q);next.set(key,value);
    return `/coach/${section}?${next}`;
  };
  return (
    <>
    {!path[1]&&<section dir="rtl" className="server-browse" aria-label="تصفح بيانات الخادم">
      <p>إجمالي النشطين: {data.page_info?.total_active_clients??data.clients.filter(c=>!c.archived).length} · مؤشرات اللوحة تخص المتدربين المحملين في هذه الصفحة.</p>
      <form className="server-browse-search" action={`/coach/${section}`}><input className="field" name="q" defaultValue={search.q} placeholder="بحث في جميع المتدربين والقوالب" maxLength={120}/><button className="btn-secondary">بحث</button></form>
      {data.page_info?.next_client&&<Link className="btn" href={pageLink("after",data.page_info.next_client)}>المتدربون التاليون</Link>}
      {section==="library"&&data.page_info?.next_template&&<Link className="btn" href={pageLink("template_after",data.page_info.next_template)}>القوالب التالية</Link>}
      {section==="library"&&data.page_info?.next_exercise&&<Link className="btn" href={pageLink("exercise_after",data.page_info.next_exercise)}>التمارين الخاصة التالية</Link>}
      {(search.after||search.template_after||search.exercise_after||search.q)&&<Link className="btn" href={`/coach/${section}`}>الصفحة الأولى</Link>}
    </section>}
    {search.trial === "started" && platform?.status === "trialing" && platform.trial_end && (
      <div className="trial-banner" role="status">
        <strong>بدأت تجربتك المجانية</strong>
        <p>كل مزايا باقة الأعمال مفتوحة لك حتى {new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { dateStyle: "long", timeZone: "Asia/Riyadh" }).format(new Date(platform.trial_end))}. لا بطاقة ولا خصم؛ تفاصيل اشتراكك في <Link href="/subscription">صفحة الاشتراك</Link>.</p>
      </div>
    )}
    <Workspace
      data={data}
      platform={platform}
      section={section}
      tutorialDismissed={tutorialDismissed}
      clientId={path[1]}
      initialFilter={
        search.filter ?? (search.add ? "add" : "")
      }
      initialTab={editing ? search.tab === "nutrition" ? "nutrition" : "program" : search.tab ?? "overview"}
      initialQuery={search.q ?? ""}
      initialTemplate={search.template}
      appUrl={process.env.APP_URL ?? "http://127.0.0.1:3200"}
      local={localMode()}
      supportOwner={isSupportOwner}
    />
    </>
  );
}
