"use client";
import { useLocale } from "./locale-provider";
import { useRef, useState } from "react";
import Link from "next/link";
import { demoLogin } from "@/app/demo-actions";
import {
  loginAction,
  registerAction,
  magicLinkAction,
  type Result,
} from "@/app/actions";
import { Notice } from "./forms";
export function AuthForm({ next, local }: { next: string; local: boolean }) {
  const { t: tr } = useLocale();

  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [email,setEmail]=useState(local ? "coach@example.test" : "");
  const demo=!register&&email.trim().toLowerCase()==="test";
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <div>
      <form
        ref={formRef}
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          try {
            if(demo){
              const form=new FormData(event.currentTarget);form.set("username","test");
              setResult(await demoLogin(form));
            } else setResult(
              await (register ? registerAction : loginAction)(
                new FormData(event.currentTarget),
              ),
            );
          } finally {
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
              <select className="field" id="auth-role" name="role">
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
            type={demo?"text":"email"}
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
            minLength={register ? 12 : demo ? 4 : 8}
            autoComplete={register ? "new-password" : "current-password"}
            defaultValue={local ? "CoachPreview!2026" : ""}
          />
        </div>
        <button disabled={busy} className="btn w-full" type="submit">
          {busy
            ? tr("نتحقق من بياناتك…")
            : register
              ? tr("إنشاء حساب")
              : tr("الدخول إلى مساحتك")}
        </button>
        {!local && !register && !demo ? (
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
        <Notice result={result} />
      </form>
      {!register&&<Link href="/demo" className="auth-demo-entry"><strong>{tr("جرّب المنصة بحساب تجريبي")}</strong><span>{tr("اسم المستخدم: test · كلمة المرور: test")}</span></Link>}
      {!local ? (
        <button
          className="mt-5 text-sm text-teal"
          onClick={() => {
            setRegister(!register);
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
