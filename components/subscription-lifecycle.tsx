import Link from "next/link";
import { cancelPlatformSubscription } from "@/app/platform-actions";
import { SubscriptionState, riyadhDate, sar, type PlatformState } from "@/lib/platform/plans";
import { paymentReadinessMessage, type PaymentReadiness } from "@/lib/platform/payment-config";

export type BillingOverview = { notifications: { id: string; body: string; created_at: string }[]; invoices: { id: string; amount_halalas: number; status: string; paid_at: string | null; due_at: string; payment_url: string | null; transaction_no: string | null; order_no: string | null; attempt_status: string | null }[] };
const copy: Record<SubscriptionState, [string,string]> = {
 NOT_STARTED:["لم تبدأ التجربة","الاحترافية 499.00 ريال لكل 30 يومًا. التجربة تمنحك مزايا الأعمال لمدة 14 يومًا بعد التأكيد وجاهزية الدفع."],
 TRIAL_ACTIVE:["التجربة نشطة","كل مزايا الأعمال متاحة لمدة 14 يومًا. لا نحفظ بطاقة ولا نخصم تلقائيًا."],
 TRIAL_ENDING:["تجربتك تنتهي قريبًا","باقي 3 أيام أو أقل. سنعرض رابط دفع الفترة عند انتهاء التجربة، مع مهلة سماح 3 أيام."],
 AWAITING_PAYMENT:["بانتظار سداد الفترة","ادفع بنفسك عبر الرابط للاحتفاظ بالمزايا. إنشاء الفاتورة لا يعني خصم المبلغ."],
 ACTIVE:["الاشتراك نشط","تم تأكيد دفع الفترة. تظهر فاتورة التجديد قبل نهايتها بـ5 أيام دون خصم تلقائي."],
 PAST_DUE:["مهلة سماح للسداد","انتهت الفترة المدفوعة. تستمر المزايا 3 أيام، ثم تعود للباقة المجانية إذا لم يتم الدفع."],
 SUSPENDED:["المزايا المدفوعة متوقفة","تستخدم الباقة المجانية الآن. بياناتك محفوظة؛ سداد فترة جديدة يعيد تفعيل باقتك."],
 CANCELLED:["الاشتراك ملغى","لن نصدر تجديدًا جديدًا ولن يحدث أي خصم. يستمر وصولك حتى نهاية الفترة الحالية ثم يعود للمجانية."],
 PAYMENT_FAILED:["تعذّر إكمال الدفع","لم نفعّل فترة مدفوعة. يمكنك المحاولة عبر الرابط الحالي؛ يُنشأ بديل بعد تأكيد إلغاء السابق فقط."],
 PROVIDER_NOT_READY:["التفعيل معطل لحين تأكيد جاهزية وسيلة الدفع","لا يمكن بدء تجربة أو إنشاء فاتورة جديدة الآن. صلاحية الفترة الحالية لا تُلغى بسبب عطل المزود."],
 TAX_NOT_CONFIGURED:["لم تُحدد إعدادات التسجيل الضريبي للمشغّل","بانتظار ضبط الضريبة. لن تُنشأ فاتورة مدفوعة قبل تحديد الإجمالي."],
};
export function SubscriptionLifecycle({state,readiness,overview}:{state:PlatformState;readiness:PaymentReadiness;overview:BillingOverview}) {
 if(state.mode==="legacy")return null;
 const key=state.subscription_state??SubscriptionState.NOT_STARTED;
 const [title,body]=copy[key];
 const remaining=state.trial_end?Math.max(0,Math.ceil((Date.parse(state.trial_end)-Date.parse(state.server_now))/86400000)):0;
 return <section className="subscription-section" dir="rtl" aria-label="حالة دورة الاشتراك">
  <h2>{title}</h2><p role="status">{body}</p>
  {[SubscriptionState.TRIAL_ACTIVE,SubscriptionState.TRIAL_ENDING].includes(key)&&<p>المتبقي من التجربة: {remaining} يوم</p>}
  {state.paid_until&&<p>الفترة المدفوعة حتى {riyadhDate(state.paid_until)}</p>}
  {state.grace_ends_at&&[SubscriptionState.AWAITING_PAYMENT,SubscriptionState.PAST_DUE,SubscriptionState.PAYMENT_FAILED].includes(key)&&<p>نهاية مهلة السماح: {riyadhDate(state.grace_ends_at)}</p>}
  {!readiness.ready&&<p className="plans-alert">{paymentReadinessMessage(readiness)}</p>}
  {[SubscriptionState.NOT_STARTED,SubscriptionState.PROVIDER_NOT_READY,SubscriptionState.TAX_NOT_CONFIGURED].includes(key)&&!state.trial_used_at&&<Link className="btn-secondary" href="/subscription/confirm?plan=pro">مراجعة الاحترافية والتجربة</Link>}
  {overview.invoices.filter(i=>i.status!=="paid").map(i=><div className="card p-4 mt-4 space-y-3" key={i.id}>
   <h3>فاتورة الفترة: <bdi>{sar(i.amount_halalas)} SAR</bdi></h3>
   {i.status==="review"?<p>العملية قيد مراجعة المنصة. لا تدفع مرة أخرى إذا ظهر خصم.</p>:<>
    {i.payment_url&&!state.cancelled_at&&readiness.ready&&<a className="btn" href={i.payment_url} rel="noopener noreferrer">فتح رابط الدفع</a>}
    {!state.cancelled_at&&<Link className="btn-secondary" href={`/subscription/confirm?plan=${state.billing_plan}`}>المحاولة أو تجديد رابط الدفع</Link>}
    <p className="plan-note">صلاحية رابط Paylink نحو 24 ساعة. تحديث الرابط يتحقق من إلغاء السابق أولًا.</p>
   </>}
  </div>)}
  {overview.notifications.length>0&&<div className="mt-5"><h3>تذكيرات الاشتراك</h3><ul>{overview.notifications.map(n=><li key={n.id}>{n.body} · {riyadhDate(n.created_at)}</li>)}</ul></div>}
  {state.lifecycle_enabled&&!state.cancelled_at&&<form className="mt-5" action={cancelPlatformSubscription}><button className="btn-secondary" type="submit">إلغاء الاشتراك دون خصم</button></form>}
 </section>;
}
