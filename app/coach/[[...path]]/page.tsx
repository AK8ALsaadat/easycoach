import { redirect, notFound } from "next/navigation";
import { cookies } from "next/headers";
import { snapshot, localMode, rpc } from "@/lib/server";
import Link from "next/link";
import { Workspace } from "@/components/workspace";
import { z } from "zod";
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
  }>;
}) {
  const { path = [] } = await params;
  const search = await searchParams;
  const validId=(value?:string)=>z.uuid().safeParse(value).success?value:null;
  const data = await snapshot({target:validId(path[1]),after_client:validId(search.after),after_template:validId(search.template_after),after_exercise:validId(search.exercise_after),search_text:(search.q??"").slice(0,120)});
  if (data.profile?.role !== "coach") redirect("/me");
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
    if (!allowed) return <main dir="rtl" className="mx-auto max-w-xl p-8 space-y-5"><h1>{feature === "programs" ? "البرامج التدريبية" : "مكتبة التمارين والقوالب"}</h1><p>هذه الميزة متاحة ابتداءً من الباقة الأساسية. باقتك المجانية تشمل الملفات وباقات الحصص والحضور.</p><Link href="/pricing" className="btn btn-primary">مقارنة الباقات</Link><Link href="/coach" className="btn">العودة لمساحة المدرب</Link></main>;
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
    {!path[1]&&<section dir="rtl" className="border-b px-5 py-3 flex flex-wrap items-center gap-3" aria-label="تصفح بيانات الخادم">
      <p className="text-sm">إجمالي النشطين: {data.page_info?.total_active_clients??data.clients.filter(c=>!c.archived).length} · مؤشرات اللوحة تخص المتدربين المحملين في هذه الصفحة.</p>
      <form className="flex gap-2" action={`/coach/${section}`}><input className="input" name="q" defaultValue={search.q} placeholder="بحث في جميع المتدربين والقوالب" maxLength={120}/><button className="btn">بحث</button></form>
      {data.page_info?.next_client&&<Link className="btn" href={pageLink("after",data.page_info.next_client)}>المتدربون التاليون</Link>}
      {section==="library"&&data.page_info?.next_template&&<Link className="btn" href={pageLink("template_after",data.page_info.next_template)}>القوالب التالية</Link>}
      {section==="library"&&data.page_info?.next_exercise&&<Link className="btn" href={pageLink("exercise_after",data.page_info.next_exercise)}>التمارين الخاصة التالية</Link>}
      {(search.after||search.template_after||search.exercise_after||search.q)&&<Link className="btn" href={`/coach/${section}`}>الصفحة الأولى</Link>}
    </section>}
    <Workspace
      data={data}
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
