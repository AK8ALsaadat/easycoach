import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import { TRIAL_DAYS, limitLabel, planCodes, plans, riyadhDate, riyals, type PlanCode, type PlatformQuote, type PlatformState } from "@/lib/platform/plans";

/** Campaign facts shared by the hero and the cards, derived from the quote only (never invented). */
export function trialOffer(quotes: (PlatformQuote | null)[]) {
  const quote = quotes.find(q => q && q.plan !== "free") ?? null;
  const end = quote?.trial_campaign_end ?? null;
  // An open-ended offer carries a far-future sentinel; only a real deadline within a year is announced.
  const dated = Boolean(end && quote && Date.parse(end) - Date.parse(quote.server_now) < 366 * 86_400_000);
  return { active: Boolean(quote?.trial_campaign_active), end: dated ? end : null, days: quote?.trial_days ?? TRIAL_DAYS };
}

export function TrialHero({ quotes, title, lead }: { quotes: (PlatformQuote | null)[]; title?: string; lead?: string }) {
  const offer = trialOffer(quotes);
  return <header className="plans-hero">
    {offer.active && <p className="trial-ribbon"><Sparkles size={15} aria-hidden="true" />عرض لفترة محدودة · {offer.days} يومًا مجانًا على كل الباقات المدفوعة</p>}
    <h1>{title ?? (offer.active ? `جرّب أي باقة ${offer.days} يومًا مجانًا` : "باقة تناسب مساحة تدريبك")}</h1>
    <p className="plans-lead">{lead ?? (offer.active
      ? "بدون بطاقة وبدون التزام. خلال التجربة تحصل على كل مزايا باقة الأعمال، وبعدها تعود للباقة المجانية حتى تفعّل اشتراكك، مع بقاء بياناتك محفوظة."
      : "اشتراكك في EasyCoach مستقل عن باقات الحصص التي تبيعها للمتدربين.")}</p>
    {offer.active && <p className="plans-deadline">{offer.end ? `العرض متاح حتى ${riyadhDate(offer.end)} بتوقيت الرياض` : "عرض لفترة محدودة · قد يُغلق في أي وقت، ومن بدأ تجربته يكملها كاملة"}</p>}
  </header>;
}

export function PlanCards({ quotes, state, signedIn, highlight, context }: {
  quotes: (PlatformQuote | null)[]; state: PlatformState | null; signedIn: boolean; highlight?: PlanCode | null; context: "start" | "pricing";
}) {
  const offer = trialOffer(quotes);
  const current = state && (state.status === "trialing" || state.status === "active") ? state.billing_plan : null;
  return <div className="plans-grid">
    {planCodes.map((code, index) => {
      const plan = plans[code], quote = quotes[index];
      const featured = highlight ? highlight === code : code === "pro";
      const isCurrent = current === code || (state?.mode === "legacy" && code === "business");
      return <article key={code} className={`plan-card${featured ? " is-featured" : ""}${isCurrent ? " is-current" : ""}`} aria-labelledby={`plan-${code}`}>
        <div className="plan-card-head">
          <h2 id={`plan-${code}`}>{plan.name}</h2>
          {isCurrent ? <span className="plan-tag plan-tag-current">باقتك الحالية</span> : featured && code === "pro" ? <span className="plan-tag">للعمل مع فريقك</span> : null}
        </div>
        <div className="plan-price">
          {quote ? code === "free"
            ? <><strong>0</strong><span>ريال / شهر</span></>
            : <>{quote.discount && quote.campaign_active && <del>{riyals(quote.base_halalas)}</del>}<strong>{riyals(quote.net_halalas)}</strong><span>ريال / شهر</span></>
            : <p role="status" className="text-muted">يتعذر تحميل السعر حاليًا</p>}
          {code !== "free" && offer.active && <p className="plan-trial-line">أول {offer.days} يومًا مجانًا</p>}
          {code !== "free" && quote && <p className="plan-tax-note">{quote.total_halalas === null ? "يُعرض الإجمالي بعد تحديد الضريبة وقبل أي دفع" : `الإجمالي الشهري${quote.tax_mode === "inclusive" || quote.tax_mode === "exclusive" ? " مع الضريبة" : ""}: ${riyals(quote.total_halalas)} ريال`}</p>}
        </div>
        {quote && <ul className="plan-limits">{limitLabel(quote.limits).map(line => <li key={line}>{line}</li>)}</ul>}
        <ul className="plan-features">{plan.features.map(feature => <li key={feature}><Check size={15} aria-hidden="true" />{feature}</li>)}</ul>
        <div className="plan-cta"><PlanAction code={code} quote={quote} state={state} signedIn={signedIn} offer={offer} context={context} isCurrent={isCurrent} /></div>
      </article>;
    })}
  </div>;
}

function PlanAction({ code, quote, state, signedIn, offer, context, isCurrent }: {
  code: PlanCode; quote: PlatformQuote | null; state: PlatformState | null; signedIn: boolean;
  offer: ReturnType<typeof trialOffer>; context: "start" | "pricing"; isCurrent: boolean;
}) {
  if (signedIn && !state) return <p className="plan-note">هذه باقات أدوات المدرب. <Link href="/coach" className="underline">افتح مساحتك لعرض خيارات حسابك.</Link></p>;
  if (code === "free") {
    if (!signedIn) return <Link className="btn-secondary w-full" href="/login?register=1">ابدأ مجانًا</Link>;
    return <Link className="btn-secondary w-full" href="/coach">{context === "start" ? "المتابعة بالباقة المجانية" : "مساحة المدرب"}</Link>;
  }
  if (isCurrent) return <Link className="btn-secondary w-full" href="/subscription">إدارة اشتراكي</Link>;
  if (!signedIn) {
    return offer.active
      ? <Link className="btn w-full" href={`/login?register=1&next=${encodeURIComponent(`/start?plan=${code}`)}`}>أنشئ حسابك وابدأ {offer.days} يومًا مجانًا</Link>
      : <Link className="btn-secondary w-full" href={`/subscription/confirm?plan=${code}`}>تفاصيل الباقة</Link>;
  }
  if (quote?.trial_available) {
    return <Link className="btn w-full" href={`/subscription/confirm?plan=${code}`}>ابدأ {offer.days} يومًا مجانًا</Link>;
  }
  if (state?.mode === "legacy") return <p className="plan-note">حسابك سابق ويملك كل المزايا بالفعل.</p>;
  if (state && (state.status === "trialing" || state.status === "active")) return <p className="plan-note">يمكنك تغيير باقتك من صفحة الاشتراك بعد نهاية الفترة الحالية.</p>;
  return <Link className="btn-secondary w-full" href={`/subscription/confirm?plan=${code}`}>تفاصيل الباقة</Link>;
}
