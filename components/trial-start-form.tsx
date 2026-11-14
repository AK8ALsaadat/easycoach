"use client";
import Link from "next/link";
import { useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";
import { startTrialAction } from "@/app/platform-actions";
import { POLICY_VERSION } from "@/lib/legal";
import type { PaidPlan } from "@/lib/platform/plans";

function SubmitTrial({ days }: { days: number }) {
  const { pending } = useFormStatus();
  return <button type="submit" className="btn w-full" disabled={pending} aria-busy={pending}>
    {pending && <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />}
    {pending ? "جارٍ بدء تجربتك المجانية…" : `ابدأ ${days} يومًا مجانًا الآن`}
  </button>;
}

/** Native server action remains usable without JS; validation also runs on the server. */
export function TrialStartForm({ plan, days }: { plan: PaidPlan; days: number }) {
  const [error, setError] = useState("");
  const checkbox = useRef<HTMLInputElement>(null);
  const errorId = useId();
  return <form action={startTrialAction} className="trial-confirm-form" noValidate onSubmit={event => {
    if (!checkbox.current?.checked) {
      event.preventDefault();
      setError("لبدء التجربة، وافق على الشروط والأحكام وسياسة الخصوصية أولًا.");
      checkbox.current?.focus();
    } else setError("");
  }}>
    <input type="hidden" name="plan" value={plan} />
    <label className="policy-acceptance"><input ref={checkbox} type="checkbox" name="terms_acceptance" value={POLICY_VERSION} required aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} onChange={() => setError("")} /><span>قرأت وأوافق على <Link href="/terms" target="_blank" rel="noopener">الشروط والأحكام</Link> و<Link href="/privacy" target="_blank" rel="noopener">سياسة الخصوصية</Link>، وأفهم أن التجربة لا تتجدد تلقائيًا.</span></label>
    {error && <p id={errorId} role="alert" className="plans-alert">{error}</p>}
    <SubmitTrial days={days} />
  </form>;
}
