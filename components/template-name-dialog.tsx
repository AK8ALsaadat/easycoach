"use client";
import { useState } from "react";
import { useLocale } from "./locale-provider";
import { Modal } from "./modal";
import { TEMPLATE_NAME_MAX, templateGoals, templateLevels, templateNameError } from "@/lib/template-names";
import { countLabel, nouns } from "@/lib/plural";

export type TemplateDetails = { name: string; goal: string | null; level: string | null; days_per_week: number | null };

/** Asks for a real template name (plus optional tags) before anything is created. */
export function TemplateNameDialog({
  open,
  mode,
  initial,
  existing = [],
  selfId,
  showTags = true,
  onClose,
  onSubmit,
}: {
  open: boolean;
  mode: "create" | "copy" | "rename";
  initial?: Partial<TemplateDetails>;
  existing?: { id: string; name: string }[];
  selfId?: string;
  showTags?: boolean;
  onClose: () => void;
  onSubmit: (details: TemplateDetails) => Promise<{ ok: boolean; message: string }>;
}) {
  const { t: tr, language } = useLocale();
  const [name, setName] = useState(initial?.name ?? "");
  const [goal, setGoal] = useState(initial?.goal ?? "");
  const [level, setLevel] = useState(initial?.level ?? "");
  const [days, setDays] = useState(initial?.days_per_week ? String(initial.days_per_week) : "");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState("");
  const error = templateNameError(name, existing, selfId);
  const title = mode === "create" ? "قالب جديد" : mode === "copy" ? "نسخ القالب" : "سمِّ القالب";
  return (
    <Modal open={open} onClose={() => !busy && onClose()} title={tr(title)} initialFocus="#template-name-input">
      <form
        noValidate
        onSubmit={async (event) => {
          event.preventDefault();
          setTouched(true);
          if (error || busy) return;
          setBusy(true);
          setServerError("");
          try {
            const result = await onSubmit({ name: name.trim().replace(/\s+/g, " "), goal: goal || null, level: level || null, days_per_week: days ? Number(days) : null });
            if (!result.ok) setServerError(result.message);
          } catch {
            setServerError("تعذر الاتصال. لم نتأكد من الحفظ؛ أعد المحاولة.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label htmlFor="template-name-input">{tr("اسم القالب")}</label>
        <input
          id="template-name-input"
          className="field mt-2"
          value={name}
          maxLength={TEMPLATE_NAME_MAX + 20}
          autoComplete="off"
          disabled={busy}
          aria-invalid={touched && Boolean(error)}
          aria-describedby="template-name-help"
          onChange={(event) => {
            setName(event.target.value);
            setServerError("");
          }}
          onBlur={() => setTouched(true)}
          placeholder={tr("مثال: تضخيم · 4 أيام للمتوسطين")}
        />
        <p id="template-name-help" className={touched && error ? "field-error" : "mt-1 text-xs text-muted"}>
          {tr(touched && error ? error : "من 2 إلى 60 حرفًا، ولا يتكرر مع قوالبك الأخرى.")}
        </p>
        {showTags && (
          <fieldset className="mt-4 grid gap-3 sm:grid-cols-3" disabled={busy}>
            <legend className="mb-2 text-sm text-muted">{tr("تفاصيل اختيارية تظهر كوسوم على القالب")}</legend>
            <label>
              {tr("الهدف")}
              <select className="field mt-1" value={goal} onChange={(event) => setGoal(event.target.value)}>
                <option value="">{tr("بدون")}</option>
                {templateGoals.map(([value, label]) => <option key={value} value={value}>{tr(label)}</option>)}
              </select>
            </label>
            <label>
              {tr("المستوى")}
              <select className="field mt-1" value={level} onChange={(event) => setLevel(event.target.value)}>
                <option value="">{tr("بدون")}</option>
                {templateLevels.map(([value, label]) => <option key={value} value={value}>{tr(label)}</option>)}
              </select>
            </label>
            <label>
              {tr("الأيام في الأسبوع")}
              <select className="field mt-1" value={days} onChange={(event) => setDays(event.target.value)}>
                <option value="">{tr("بدون")}</option>
                {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{countLabel(language, n, nouns.day)}</option>)}
              </select>
            </label>
          </fieldset>
        )}
        {serverError && <p role="alert" className="field-error mt-3">{tr(serverError)}</p>}
        <div className="mt-5 flex flex-wrap gap-2">
          <button className="btn" type="submit" disabled={busy}>
            {tr(busy ? "جارٍ الحفظ…" : mode === "create" ? "إنشاء القالب" : mode === "copy" ? "إنشاء النسخة" : "حفظ الاسم")}
          </button>
          <button className="btn-secondary" type="button" disabled={busy} onClick={onClose}>{tr("إلغاء")}</button>
        </div>
      </form>
    </Modal>
  );
}

/** Small tag chips for a template card. */
export function TemplateTags({ goal, level, days }: { goal?: string | null; level?: string | null; days?: number | null }) {
  const { t: tr, language } = useLocale();
  const goalLabel = templateGoals.find(([value]) => value === goal)?.[1];
  const levelLabel = templateLevels.find(([value]) => value === level)?.[1];
  if (!goalLabel && !levelLabel && !days) return null;
  return (
    <p className="template-tags">
      {goalLabel && <span className="badge">{tr(goalLabel)}</span>}
      {levelLabel && <span className="badge">{tr(levelLabel)}</span>}
      {days ? <span className="badge">{countLabel(language, days, nouns.day)} / {tr("أسبوع")}</span> : null}
    </p>
  );
}
