"use client";
import { useLocale } from "./locale-provider";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  loginAction,
  registerAction,
  magicLinkAction,
  googleLoginAction,
  type Result,
} from "@/app/actions";
import { Notice } from "./forms";
import { PASSWORD_MIN_LENGTH, passwordRequirements, passwordStrength, registrationPasswordIssue } from "@/lib/password";
function GoogleMark() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/>
    </svg>
  );
}
export function AuthForm({ next, local, google = false, initialRegister = false }: { next: string; local: boolean; google?: boolean; initialRegister?: boolean }) {
  const { t: tr } = useLocale();
  const router = useRouter();

  const [register, setRegister] = useState(initialRegister && !local);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [email,setEmail]=useState(local ? "coach@example.test" : "");
  const [password, setPassword] = useState(local ? "CoachPreview!2026" : "");
  const [confirmation, setConfirmation] = useState("");
  const requirements = passwordRequirements(password);
  const strength = passwordStrength(password);
  const formRef = useRef<HTMLFormElement>(null);
  const submitLock = useRef(false);
  return (
    <div>
      <form
        method="post"
        ref={formRef}
        onSubmit={async (event) => {
          event.preventDefault();
          if (submitLock.current) return;
          const form = new FormData(event.currentTarget);
          if (register) {
            const issue = registrationPasswordIssue(String(form.get("password") ?? ""), String(form.get("password_confirmation") ?? ""));
            if (issue) { setResult({ ok: false, message: issue }); return; }
          }
          submitLock.current = true;
          setBusy(true);
          try {
            const response = await (register ? registerAction : loginAction)(form);
            setResult(response);
            if (register && response.ok && response.url) {
              setPassword(""); setConfirmation("");
              router.replace(response.url);
            }
          } catch {
            setResult({ ok: false, message: "تعذر الاتصال. لم تكتمل العملية؛ حاول مرة أخرى." });
          } finally {
            submitLock.current = false;
            setBusy(false);
          }
        }}
        className="space-y-5"
      >
        <input type="hidden" name="next" value={next} />
        {register ? (
          <>
            <div>
              <label htmlFor="auth-name">{tr("اسمك")}</label>
              <input
                className="field"
                id="auth-name"
                name="name"
                required
                minLength={2}
                maxLength={120}
              />
            </div>
            <div>
              <label htmlFor="auth-role">{tr("نوع الحساب")}</label>
              <select className="field" id="auth-role" name="role" defaultValue={next.startsWith("/invite/") ? "trainee" : "coach"}>
                <option value="coach">{tr("مدرب")}</option>
                <option value="trainee">{tr("متدرب — بدعوة من مدربي")}</option>
              </select>
            </div>
          </>
        ) : null}
        <div>
          <label htmlFor="auth-email">{tr("الإيميل")}</label>
          <input
            id="auth-email"
            name="email"
            className="field"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={event=>setEmail(event.target.value)}
          />
        </div>
        <div>
          <label htmlFor="auth-password">{tr("كلمة المرور")}</label>
          <input
            id="auth-password"
            name="password"
            className="field"
            type="password"
            required
            minLength={register ? PASSWORD_MIN_LENGTH : 8}
            maxLength={128}
            aria-describedby={register ? "password-rules password-strength-label" : undefined}
            autoComplete={register ? "new-password" : "current-password"}
            value={password}
            onChange={event => { setPassword(event.target.value); setResult(null); }}
          />
        </div>
        {register ? (
          <>
            <div className="space-y-2 text-sm">
              <p id="password-strength-label" aria-live="polite">{tr("قوة كلمة المرور: {0}", tr(strength.label))}</p>
              <div role="meter" aria-label={tr("قوة كلمة المرور")} aria-valuemin={0} aria-valuemax={4} aria-valuenow={strength.score} aria-valuetext={tr(strength.label)} className="h-2 overflow-hidden rounded-full bg-canvas">
                <div className={`h-full transition-all ${strength.score < 2 ? "bg-red-500" : strength.score === 2 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${strength.score * 25}%` }} />
              </div>
              <ul id="password-rules" className="space-y-1 text-xs text-muted">
                {([
                  [requirements.length, "12 حرفًا على الأقل"],
                  [requirements.uppercase, "حرف إنجليزي كبير واحد على الأقل (A–Z)"],
                  [requirements.symbol, "رمز خاص واحد على الأقل مثل ! @ # $ %"],
                ] as const).map(([met, label]) => <li key={label} className={met ? "text-emerald-600" : undefined}><span aria-hidden="true">{met ? "✓" : "○"} </span>{tr(label)}</li>)}
              </ul>
            </div>
            <div>
              <label htmlFor="auth-password-confirmation">{tr("تأكيد كلمة المرور")}</label>
              <input id="auth-password-confirmation" name="password_confirmation" className="field" type="password" required minLength={PASSWORD_MIN_LENGTH} maxLength={128} autoComplete="new-password" value={confirmation} onChange={event => { setConfirmation(event.target.value); setResult(null); }} aria-invalid={Boolean(confirmation && password !== confirmation)} aria-describedby="password-match" />
              <p id="password-match" role="status" className={`mt-2 text-xs ${password === confirmation ? "text-emerald-600" : "text-danger"}`}>
                {confirmation ? tr(password === confirmation ? "كلمتا المرور متطابقتان" : "كلمتا المرور غير متطابقتين") : ""}
              </p>
            </div>
          </>
        ) : null}
        <button disabled={busy || (register && Boolean(registrationPasswordIssue(password, confirmation)))} className="btn w-full" type="submit">
          {busy
            ? tr("نتحقق من بياناتك…")
            : register
              ? tr("إنشاء حساب")
              : tr("الدخول إلى مساحتك")}
        </button>
        {!local && !register ? (
          <button
            type="button"
            disabled={busy}
            className="btn-secondary w-full"
            onClick={async () => {
              if (!formRef.current) return;
              setBusy(true);
              try {
                setResult(await magicLinkAction(new FormData(formRef.current)));
              } finally {
                setBusy(false);
              }
            }}
          >
            {tr("الدخول برابط على الإيميل")}
          </button>
        ) : null}
        {google ? (
          <>
            <div className="auth-divider"><span>{tr("أو")}</span></div>
            <button
              type="button"
              disabled={busy}
              className="btn-secondary auth-google w-full"
              onClick={async () => {
                setBusy(true);
                setResult(null);
                try {
                  const role = register ? String(new FormData(formRef.current ?? undefined).get("role") ?? "") : undefined;
                  const response = await googleLoginAction({ next, role: role || undefined });
                  if (response.ok && response.url) window.location.assign(response.url);
                  else { setResult(response); setBusy(false); }
                } catch {
                  setResult({ ok: false, message: "تعذر فتح الدخول بحساب Google" });
                  setBusy(false);
                }
              }}
            >
              <GoogleMark />
              {register ? tr("التسجيل بحساب Google") : tr("الدخول بحساب Google")}
            </button>
          </>
        ) : null}
        <Notice result={result} />
      </form>
      {!local ? (
        <button
          className="mt-5 text-sm text-teal"
          onClick={() => {
            setRegister(!register);
            setPassword("");
            setConfirmation("");
            setResult(null);
          }}
        >
          {register ? tr("عندك حساب؟ ادخل") : tr("جديد هنا؟ أنشئ حسابك")}
        </button>
      ) : (
        <div className="mt-6 rounded-xl border border-dashed bg-canvas p-4 text-xs leading-7 text-muted">
          <p className="font-bold text-ink">
            {tr("حسابات اصطناعية للمعاينة فقط")}
          </p>
          <p dir="ltr" className="text-right">
            coach@example.test · coach2@example.test
          </p>
          <p dir="ltr" className="text-right">
            trainee@example.test
          </p>
          <p>
            {tr("كلمة المرور للجميع:")} <code dir="ltr">CoachPreview!2026</code>
          </p>
          <p>{tr("المدرب الثاني معزول عن بيانات الأول.")}</p>
        </div>
      )}
    </div>
  );
}
