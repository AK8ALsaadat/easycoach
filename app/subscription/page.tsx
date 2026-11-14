import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { platformQuote, platformState } from "@/lib/platform/server";
import { plans, riyadhDate, sar } from "@/lib/platform/plans";
import { rpc } from "@/lib/server";
import { Brand } from "@/components/brand";
import { PlatformResourceSelection } from "@/components/platform-resource-selection";
import { OrganizationForm } from "@/components/organization-controls";
import { z } from "zod";
import { PlatformTrialCountdown } from "@/components/platform-trial-countdown";
export const dynamic="force-dynamic";
const statusLabel = { free: "الباقة المجانية", trialing: "تجربة مجانية", active: "اشتراك نشط", past_due: "بانتظار الدفع", expired: "انتهت الفترة" } as const;
const statusTone = { free: "neutral", trialing: "trial", active: "ok", past_due: "warn", expired: "warn" } as const;
export default async function SubscriptionPage({searchParams}:{searchParams:Promise<{before?:string;id?:string}>}) {
  const search=await searchParams;
  const state=await platformState();
  const [invoices,resources,team,trialQuote]=await Promise.all([
    rpc<{id:string;amount_halalas:number;status:string;created_at:string}[]>("ec_invoice_page",{before_date:z.iso.datetime({offset:true}).safeParse(search.before).success?search.before:null,before_id:z.uuid().safeParse(search.id).success?search.id:null}),
    rpc<{clients:{id:string;name:string}[];templates:{id:string;name:string}[];next_client:string|null;next_template:string|null}>("ec_resource_options"),
    rpc<{id:string;name:string}[]>("ec_team_options"),
    platformQuote("pro").catch(() => null),
  ]);
  const exceeded=(state.limits.clients!==null&&state.usage.clients>state.limits.clients)||(state.limits.templates!==null&&state.usage.templates>state.limits.templates);
  const canStartTrial = Boolean(trialQuote?.trial_available);
  return <main dir="rtl" className="subscription-page">
    <div className="plans-topbar"><Brand /><Link href="/coach" className="btn-secondary"><ArrowLeft size={16} aria-hidden="true" />مساحة المدرب</Link></div>
    <h1>اشتراك EasyCoach</h1>
    {state.status==="trialing"&&state.trial_end&&<PlatformTrialCountdown key={state.server_now} end={state.trial_end} serverNow={state.server_now} plan={state.billing_plan} limits={state.billing_limits} hasPaymentMethod={Boolean(state.has_payment_method)}/>}
    <section className="subscription-status">
      {state.mode==="legacy"
        ? <><span className="status-chip" data-tone="ok">حساب سابق · كل المزايا</span><h2>بقيت صلاحياتك وبياناتك كما هي</h2><p className="text-muted">الانتقال إلى نظام الباقات الجديد يتطلب سياسة انتقال صريحة وموافقتك.</p></>
        : <>
          <span className="status-chip" data-tone={statusTone[state.status]}>{statusLabel[state.status]}</span>
          <h2>الباقة المتاحة الآن: {plans[state.effective_plan].name}</h2>
          {(state.status==="trialing"||state.status==="active") && <p className="text-muted">باقتك المختارة: {plans[state.billing_plan].name} · {state.total_halalas===null?"الإجمالي الشهري يُعرض بعد ضبط الضريبة":sar(state.total_halalas)+" ريال شهريًا"}{state.trial_end && state.status==="trialing" ? ` · تنتهي التجربة في ${riyadhDate(state.trial_end)}` : ""}</p>}
          {state.status==="expired" && <p className="text-muted">انتهت تجربتك المجانية وعادت صلاحياتك إلى الباقة المجانية. بياناتك ومتدربوك محفوظون كما هم.</p>}
          {canStartTrial && <Link href="/start" className="btn" style={{width:"fit-content"}}>ابدأ 14 يومًا مجانًا على أي باقة</Link>}
          {!canStartTrial && state.status!=="trialing" && state.status!=="active" && <Link href="/pricing" className="btn-secondary" style={{width:"fit-content"}}>مقارنة الباقات</Link>}
        </>}
    </section>
    <section className="usage-grid" aria-label="الاستخدام الحالي">{(["clients","coaches","templates"] as const).map(kind=>{
      const limit=state.limits[kind];
      return <div key={kind} className="usage-card"><h2>{({clients:"المتدربون النشطون",coaches:"حسابات المدربين",templates:"القوالب الخاصة"})[kind]}</h2><p><bdi dir="ltr">{state.usage[kind]} / {limit??"∞"}</bdi></p>{limit!==null&&limit>0&&<progress max={limit} value={Math.min(state.usage[kind],limit)} aria-label="نسبة الاستخدام"/>}</div>;
    })}</section>
    {state.features.includes("branding")&&<section className="subscription-section"><h2>لون بوابة المتدرب</h2><OrganizationForm operation="ec_brand_color" fields={[{name:"color",label:"اللون الأساسي",type:"color"}]} label="حفظ لون البوابة"/></section>}
    <section className="subscription-section"><h2>الدفع والتجديد</h2><p>التجربة المجانية لا تحتاج بطاقة ولا تتجدد تلقائيًا. تفعيل الدفع والتجديد الآلي للاشتراكات المدفوعة قيد التحقق لدى مزود الدفع، وسنعرض الطريقة هنا عند اكتماله؛ لا يُخصم أي مبلغ دون تأكيدك.</p></section>
    {exceeded&&<section className="subscription-section"><h2>اختر السجلات التي ستبقى نشطة ضمن حدود باقتك</h2><PlatformResourceSelection clients={resources.clients} templates={resources.templates} selectedClients={state.locked_clients} selectedTemplates={state.locked_templates} nextClient={resources.next_client} nextTemplate={resources.next_template}/></section>}
    {state.usage.coaches>state.limits.coaches&&<section className="subscription-section"><h2>اختر أعضاء الفريق الذين سيبقون نشطين</h2><p>المالك يحتسب ضمن الحد. تبقى بيانات الأعضاء الموقوفين محفوظة.</p>{team.map(member=><div className="border p-4 rounded-xl" key={member.id}><p>{member.name}</p><OrganizationForm operation="ec_team_deactivate" defaults={{member:member.id}} fields={[]} label="إيقاف العضو"/></div>)}</section>}
    <section className="subscription-section"><h2>فواتير اشتراك EasyCoach</h2><p>هذه لا تشمل دفعات المتدربين لمدربهم.</p>{invoices.length?<ul>{invoices.map(i=><li key={i.id}><span>{sar(i.amount_halalas)} ريال</span><span className="text-muted">{i.status}</span></li>)}</ul>:<p>لا توجد فواتير مسجلة.</p>}{invoices.length===50&&<Link className="btn-secondary" href={`/subscription?before=${encodeURIComponent(invoices.at(-1)!.created_at)}&id=${invoices.at(-1)!.id}`}>الفواتير الأقدم</Link>}</section>
  </main>;
}
