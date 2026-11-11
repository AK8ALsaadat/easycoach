"use client";
/* eslint-disable @next/next/no-img-element -- Includes local file previews. */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveCoachBranding } from "@/app/branding-actions";
import { avatarUrl, type CoachBranding } from "@/lib/coach-branding";
import { useLocale } from "./locale-provider";

export function CoachBrandingSettings({ branding, defaultName }: { branding?: CoachBranding; defaultName: string }) {
  const { t } = useLocale();
  const router = useRouter();
  const [saved, setSaved] = useState(branding);
  const [name, setName] = useState(branding?.display_name ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [remove, setRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const image = preview || (remove ? "/coach-avatar.svg" : avatarUrl(saved));
  return <section className="card mb-5 p-5" aria-labelledby="coach-branding-heading">
    <h2 id="coach-branding-heading">{t("هويتك أمام المتدربين")}</h2>
    <p className="mt-2 text-sm leading-7 text-muted">{t("تظهر لجميع متدربيك وفي معاينة روابطك عند مشاركتها. اختر اسمًا وصورة مناسبين للمشاركة. تبقى هوية إيزي كوتش ظاهرة.")}</p>
    <form className="mt-5 space-y-4" onSubmit={async event => {
      event.preventDefault();
      setBusy(true); setNotice(null);
      const form = new FormData();
      form.set("display_name", name);
      form.set("version", saved?.updated_at ?? "");
      if (file) form.set("avatar", file);
      form.set("remove_avatar", String(remove));
      try {
        const result = await saveCoachBranding(form);
        setNotice(result);
        if (result.ok && result.branding) {
          setSaved(result.branding); setFile(null); setPreview(""); setRemove(false);
          if (input.current) input.current.value = "";
          router.refresh();
        }
      } catch { setNotice({ ok: false, message: "تعذر الاتصال. بياناتك ما زالت هنا، أعد المحاولة." }); }
      finally { setBusy(false); }
    }}>
      <fieldset disabled={busy} className="min-w-0 space-y-4">
        <div className="flex min-w-0 items-center gap-3">
          <img src={image} alt={t("معاينة صورة المدرب")} width={72} height={72} className="h-18 w-18 shrink-0 rounded-full object-cover" />
          <strong className="min-w-0 break-words" dir="auto">{name.trim() || defaultName}</strong>
        </div>
        <label className="block" htmlFor="coach-display-name">{t("الاسم الظاهر للمتدربين")}
          <input id="coach-display-name" className="field" value={name} onChange={e => setName(e.target.value)} maxLength={120} minLength={2} placeholder={defaultName} aria-describedby="coach-name-hint" />
        </label>
        <p id="coach-name-hint" className="text-xs text-muted">{t("اتركه فارغًا لاستخدام اسم حسابك. هذا التعديل لا يغيّر اسم الحساب.")}</p>
        <label className="block" htmlFor="coach-portrait">{t("صورة المدرب")}
          <input ref={input} id="coach-portrait" type="file" accept="image/jpeg,image/png,image/webp" className="field max-w-full" aria-describedby="coach-photo-hint" onChange={e => {
            const selected = e.target.files?.[0] ?? null;
            if (selected && selected.size > 5 * 1024 * 1024) {
              setNotice({ ok: false, message: "اختر صورة بحجم لا يتجاوز 5 ميجابايت" }); e.target.value = ""; return;
            }
            setFile(selected); setPreview(selected ? URL.createObjectURL(selected) : ""); setRemove(false); setNotice(null);
          }} />
        </label>
        <p id="coach-photo-hint" className="text-xs text-muted">{t("JPG أو PNG أو WebP، حتى 5 ميجابايت. تظهر الصورة مربعة؛ نزيل بيانات الموقع قبل حفظها.")}</p>
        <div className="flex flex-wrap gap-3">
          {(file || saved?.avatar_id) && <button type="button" className="btn-secondary" onClick={() => { setFile(null); setPreview(""); setRemove(true); if (input.current) input.current.value = ""; }}>{t("استخدام الصورة الافتراضية")}</button>}
          <button className="btn" disabled={busy}>{busy ? t("جارٍ حفظ الهوية…") : t("حفظ الهوية")}</button>
        </div>
      </fieldset>
      {notice && <p role={notice.ok ? "status" : "alert"} className="text-sm leading-7">{t(notice.message)}</p>}
    </form>
  </section>;
}
