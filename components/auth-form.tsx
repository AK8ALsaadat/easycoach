"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, EyeOff, Sparkles, Check } from "lucide-react";
import { POLICY_VERSION } from "@/lib/legal";
import { useLocale } from "./locale-provider";
import { loginAction, registerAction, magicLinkAction, googleLoginAction, type Result } from "@/app/actions";
import { Notice } from "./forms";
import { PASSWORD_MIN_LENGTH, registrationPasswordIssue } from "@/lib/password";
export function AuthForm({ next, local, google = false, initialRegister = false }: {
    next: string;
    local: boolean;
    google?: boolean;
    initialRegister?: boolean;
}) {
    const { t: tr } = useLocale();
    const router = useRouter();
    const [register, setRegister] = useState(initialRegister);
    const [role, setRole] = useState(next.startsWith("/invite/") ? "trainee" : "coach");
    const [busy, setBusy] = useState(false), [showPassword, setShowPassword] = useState(false);
    const [result, setResult] = useState<Result | null>(null);
    const [email, setEmail] = useState(local ? "coach@example.test" : "");
    const [password, setPassword] = useState(local ? "CoachPreview!2026" : "");
    const formRef = useRef<HTMLFormElement>(null), submitLock = useRef(false);
    const freeTrial = register && role === "coach";
    function switchMode(value: boolean) { setRegister(value); setPassword(""); setResult(null); }
    return <div className="auth-form-wrap">
    <div className="auth-mode-switch" aria-label={tr("الدخول أو التسجيل")}><button type="button" aria-pressed={!register} onClick={() => switchMode(false)} disabled={busy}>{tr("تسجيل الدخول")}</button><button type="button" aria-pressed={register} onClick={() => switchMode(true)} disabled={busy}>{tr("إنشاء حساب")}</button></div>
    <div className="auth-form-heading">
      <p className="eyebrow">{freeTrial ? <><Sparkles size={15}/>{tr("14 يومًا مجانًا · بدون بطاقة")}</> : tr("مساحتك التدريبية")}</p>
      <h1>{freeTrial ? tr("أول خطوة لشغل أرتب.") : register ? tr("أهلًا بك في فريقك.") : tr("أهلًا بعودتك.")}</h1>
      <p>{freeTrial ? tr("أنشئ حسابك، أكّد بريدك، وابدأ تجربتك مباشرة. الباقة والدفع تختارهما لاحقًا.") : register ? tr("أنشئ حسابك للانضمام إلى مدربك.") : tr("متدربوك، برامجك، وكل التفاصيل بانتظارك.")}</p>
    </div>
    <form method="post" ref={formRef} className="auth-fields" onSubmit={async (event) => {
            event.preventDefault();
            if (submitLock.current)
                return;
            const form = new FormData(event.currentTarget);
            if (register) {
                const issue = registrationPasswordIssue(password, password);
                if (issue) {
                    setResult({ ok: false, message: issue });
                    return;
                }
            }
            submitLock.current = true;
            setBusy(true);
            setResult(null);
            try {
                const response = await (register ? registerAction : loginAction)(form);
                setResult(response);
                if (register && response.ok && response.url) {
                    setPassword("");
                    router.replace(response.url);
                }
            }
            catch {
                setResult({ ok: false, message: tr("تعذّر الاتصال. حاول مرة أخرى، بياناتك في النموذج محفوظة.") });
            }
            finally {
                submitLock.current = false;
                setBusy(false);
            }
        }}>
      <input type="hidden" name="next" value={next}/>
      {register && <><div><label htmlFor="auth-name">{tr("اسمك")}</label><input className="field" id="auth-name" name="name" autoComplete="name" placeholder={tr("كيف نناديك؟")} required minLength={2} maxLength={120} disabled={busy}/></div><input type="hidden" name="password_confirmation" value={password}/></>}
      <div><label htmlFor="auth-email">{tr("البريد الإلكتروني")}</label><input id="auth-email" name="email" className="field" type="email" required autoComplete="email" inputMode="email" dir="ltr" placeholder="you@example.com" value={email} onChange={event => setEmail(event.target.value)} disabled={busy}/></div>
      <div><label htmlFor="auth-password">{tr("كلمة المرور")}</label><div className="password-field"><input id="auth-password" name="password" className="field" type={showPassword ? "text" : "password"} required minLength={register ? PASSWORD_MIN_LENGTH : 8} maxLength={128} autoComplete={register ? "new-password" : "current-password"} dir="ltr" value={password} onChange={event => { setPassword(event.target.value); setResult(null); }} disabled={busy} aria-describedby={register ? "password-hint" : undefined}/><button type="button" aria-label={showPassword ? tr("إخفاء كلمة المرور") : tr("إظهار كلمة المرور")} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div>{register && <p id="password-hint" className="field-hint">{tr("8 أحرف على الأقل، مع حرف إنجليزي كبير ورمز مثل !")}</p>}</div>
      {register && <details className="auth-role-details" open={next.startsWith("/invite/")}><summary>{role === "trainee" ? tr("حساب متدرب بدعوة من مدربي") : tr("تسجل كمتدرب؟")}</summary><label className="sr-only" htmlFor="auth-role">{tr("نوع الحساب")}</label><select className="field" id="auth-role" name="role" value={role} onChange={event => setRole(event.target.value)} disabled={busy}><option value="coach">{tr("مدرب · مساحة لإدارة متدربيّ")}</option><option value="trainee">{tr("متدرب · بدعوة من مدربي")}</option></select></details>}
      {register && <label className="policy-acceptance"><input type="checkbox" name="terms_acceptance" value={POLICY_VERSION} required disabled={busy}/><span>{tr("أوافق على") + " "}<Link href="/terms" target="_blank" rel="noopener">{tr("الشروط")}</Link>{" " + tr("و")}<Link href="/privacy" target="_blank" rel="noopener">{tr("الخصوصية")}</Link>{freeTrial ? tr(" وبدء تجربتي المجانية بعد تأكيد البريد، دون بطاقة أو تجديد تلقائي.") : "."}</span></label>}
      <Notice result={result}/>
      <button disabled={busy} className="btn auth-submit" type="submit">{busy ? tr("نجهّز مساحتك\u2026") : freeTrial ? tr("أنشئ حسابي وابدأ التجربة") : register ? tr("إنشاء حساب") : tr("الدخول إلى مساحتك")}{!busy && <ArrowLeft size={18}/>}</button>
      {!local && !register && <button type="button" disabled={busy} className="auth-magic-link" onClick={async () => { if (!formRef.current)
        return; setBusy(true); try {
        setResult(await magicLinkAction(new FormData(formRef.current)));
    }
    finally {
        setBusy(false);
    } }}>{tr("الدخول برابط على البريد بدل كلمة المرور")}</button>}
      {google && <><div className="auth-divider"><span>{tr("أو")}</span></div><button type="button" disabled={busy} className="btn-secondary auth-google w-full" onClick={async () => { const acceptance = formRef.current?.querySelector<HTMLInputElement>('[name="terms_acceptance"]'); if (register && !acceptance?.checked) {
        acceptance?.reportValidity();
        return;
    } setBusy(true); try {
        const r = await googleLoginAction({ next, role: register ? role : undefined, trial: freeTrial });
        if (r.ok && r.url)
            window.location.assign(r.url);
        else {
            setResult(r);
            setBusy(false);
        }
    }
    catch {
        setResult({ ok: false, message: tr("تعذّر فتح Google. حاول مرة أخرى.") });
        setBusy(false);
    } }}><span className="google-letter" aria-hidden="true">G</span>{register ? tr("التسجيل بحساب Google") : tr("الدخول بحساب Google")}</button></>}
    </form>
    {freeTrial && <p className="auth-reassurance"><Check size={15}/>{tr("لا جوال، لا بطاقة، ولا التزام بالدفع.")}</p>}
    {local && !register && <p className="field-hint mt-5">{tr("حسابات اصطناعية للمعاينة فقط")} · <bdi>coach@example.test</bdi> · <bdi>CoachPreview!2026</bdi></p>}
  </div>;
}
