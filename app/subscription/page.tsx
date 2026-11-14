import Link from "next/link";
import { platformState } from "@/lib/platform/server";
import { plans, sar } from "@/lib/platform/plans";
import { rpc } from "@/lib/server";
import { PlatformResourceSelection } from "@/components/platform-resource-selection";
import { OrganizationForm } from "@/components/organization-controls";
import { z } from "zod";
import { PlatformTrialCountdown } from "@/components/platform-trial-countdown";
export const dynamic="force-dynamic";
export default async function SubscriptionPage({searchParams}:{searchParams:Promise<{before?:string;id?:string}>}) {
  const search=await searchParams;
  const state=await platformState();
  const [invoices,resources,team]=await Promise.all([
    rpc<{id:string;amount_halalas:number;status:string;created_at:string}[]>("ec_invoice_page",{before_date:z.iso.datetime({offset:true}).safeParse(search.before).success?search.before:null,before_id:z.uuid().safeParse(search.id).success?search.id:null}),
    rpc<{clients:{id:string;name:string}[];templates:{id:string;name:string}[];next_client:string|null;next_template:string|null}>("ec_resource_options"),
    rpc<{id:string;name:string}[]>("ec_team_options"),
  ]);
  const exceeded=(state.limits.clients!==null&&state.usage.clients>state.limits.clients)||(state.limits.templates!==null&&state.usage.templates>state.limits.templates);
  return <main dir="rtl" className="max-w-4xl mx-auto p-6 space-y-6"><div className="flex justify-between"><Link href="/coach">← مساحة المدرب</Link><Link href="/pricing" className="btn">مقارنة الباقات</Link></div>
    <h1>اشتراك EasyCoach</h1>
    {state.status==="trialing"&&state.trial_end&&<PlatformTrialCountdown key={state.server_now} end={state.trial_end} serverNow={state.server_now} plan={state.billing_plan} limits={state.billing_limits}/>}
    {state.mode==="legacy"?<p className="border p-4 rounded-xl">حساب سابق: بقيت صلاحياتك وبياناتك الحالية كما هي. الانتقال للنظام الجديد يتطلب سياسة انتقال صريحة.</p>:<p>الباقة المتاحة الآن: <strong>{plans[state.effective_plan].name}</strong> · الحالة: {({free:"مجاني",trialing:"تجربة",active:"نشط",past_due:"بانتظار الدفع",expired:"منتهي"} as const)[state.status]}</p>}
    {(state.status==="trialing"||state.status==="active")&&<section className="border p-5 rounded-xl space-y-2"><p>باقة الفوترة: {plans[state.billing_plan].name} · {state.total_halalas===null?"غير محدد":sar(state.total_halalas)+" ريال شهريًا"}</p>{state.trial_end&&<p>نهاية التجربة: {new Intl.DateTimeFormat("ar-SA",{dateStyle:"long",timeStyle:"short",timeZone:"Asia/Riyadh"}).format(new Date(state.trial_end))} — الرياض</p>}<p>{state.cancel_at_period_end?"التجديد ملغى؛ تستمر المزايا إلى نهاية الفترة":"التجديد غير ملغى"}</p></section>}
    <section className="grid sm:grid-cols-3 gap-4">{(["clients","coaches","templates"] as const).map(kind=><div key={kind} className="border rounded-xl p-5"><h2>{({clients:"المتدربون النشطون",coaches:"حسابات المدربين",templates:"القوالب الخاصة"})[kind]}</h2><p><bdi dir="ltr">{state.usage[kind]} / {state.limits[kind]??"غير محدود"}</bdi></p></div>)}</section>
    {state.features.includes("branding")&&<section className="border rounded-xl p-5 space-y-3"><h2>لون بوابة المتدرب</h2><OrganizationForm operation="ec_brand_color" fields={[{name:"color",label:"اللون الأساسي",type:"color"}]} label="حفظ لون البوابة"/></section>}
    <section className="border rounded-xl p-5 space-y-3"><h2>طريقة الدفع والتجديد والإلغاء</h2><p>إدارة البطاقة والتجديد الآلي معطلة إلى أن يكتمل التحقق من Paylink. لا نوقف التجديد في قاعدة البيانات وحدها دون تأكيد المزود.</p></section>
    {exceeded&&<section className="space-y-4"><h2>اختر السجلات التي ستبقى نشطة ضمن حدود باقتك</h2><PlatformResourceSelection clients={resources.clients} templates={resources.templates} selectedClients={state.locked_clients} selectedTemplates={state.locked_templates} nextClient={resources.next_client} nextTemplate={resources.next_template}/></section>}
    {state.usage.coaches>state.limits.coaches&&<section className="space-y-4"><h2>اختر أعضاء الفريق الذين سيبقون نشطين</h2><p>المالك يحتسب ضمن الحد. تبقى بيانات الأعضاء الموقوفين محفوظة.</p>{team.map(member=><div className="border p-4 rounded-xl" key={member.id}><p>{member.name}</p><OrganizationForm operation="ec_team_deactivate" defaults={{member:member.id}} fields={[]} label="إيقاف العضو"/></div>)}</section>}
    <section className="space-y-3"><h2>فواتير اشتراك EasyCoach</h2><p className="text-muted">هذه لا تشمل دفعات المتدربين لمدربهم.</p>{invoices.length?<ul>{invoices.map(i=><li key={i.id} className="border-b py-3">{sar(i.amount_halalas)} ريال — {i.status}</li>)}</ul>:<p>لا توجد فواتير مسجلة.</p>}{invoices.length===50&&<Link className="btn" href={`/subscription?before=${encodeURIComponent(invoices.at(-1)!.created_at)}&id=${invoices.at(-1)!.id}`}>الفواتير الأقدم</Link>}</section>
  </main>;
}
