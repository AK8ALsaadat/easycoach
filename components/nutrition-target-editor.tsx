"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { manage } from "@/app/management-actions";
import type { Result } from "@/app/actions";
import { recordSchemas } from "@/lib/management";
import { riyadhToday } from "@/lib/dates";
import type { Client, Content, Snapshot } from "@/lib/model";
import { clientInsights } from "@/lib/client-insights";
import { inferCaloriesMode, macroTargetErrors, withCaloriesMode, type CaloriesMode } from "@/lib/macros";
import { Notice } from "./forms";
import { useLocale } from "./locale-provider";
import { useUnsavedChanges } from "./use-unsaved-changes";
import { MealEditor } from "./meal-editor";
import { MacroTargets } from "./macro-targets";

type Targets = { calories: number; protein: number; carbs: number; fat: number; calories_mode: CaloriesMode };

export function NutritionTargetEditor({ data, client }: { data: Snapshot; client: Client }) {
  const { t: tr } = useLocale();
  const router = useRouter();
  const current = clientInsights(data, client.id).nutrition;
  const [values, setValues] = useState<Targets>(() => {
    const base = { calories: current?.calories ?? 0, protein: current?.protein ?? 0, carbs: current?.carbs ?? 0, fat: current?.fat ?? 0 };
    // Old targets keep their manual number; new and matching ones start in auto mode.
    return withCaloriesMode({ ...base, calories_mode: "auto" as CaloriesMode }, inferCaloriesMode({ ...base, calories_mode: current?.calories_mode }));
  });
  const [text, setText] = useState(current?.text ?? "");
  const [day, setDay] = useState(riyadhToday());
  const [meals, setMeals] = useState<NonNullable<Content["nutrition"]["meals"]>>(() => structuredClone(current?.meals ?? []));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const request = useRef<string | null>(null);
  const locked = useRef(false);
  useUnsavedChanges(dirty);
  const changed = () => {
    setDirty(true);
    setResult(null);
  };
  const fieldErrors = macroTargetErrors(values);
  return (
    <section className="card p-5 sm:p-7" data-testid="nutrition-target-editor">
      <h2>{tr("تعديل سعرات المتدرب والماكروز")}</h2>
      <p className="mt-2 text-sm text-muted">{tr("احفظ هدف التغذية بتاريخ سريان مستقل؛ يبقى جدول التمارين محفوظًا.")}</p>
      <form
        className="mt-6 space-y-5"
        noValidate
        onSubmit={async (event) => {
          event.preventDefault();
          if (locked.current || !dirty) return;
          if (Object.keys(fieldErrors).length) {
            setResult({ ok: false, message: "صحّح الحقول المظللة قبل الحفظ." });
            return;
          }
          if (!day) {
            setResult({ ok: false, message: "اختر تاريخ سريان السعرات." });
            return;
          }
          const checked = recordSchemas.nutrition_target.safeParse({ ...values, text, meals });
          if (!checked.success) {
            setResult({ ok: false, message: checked.error.issues[0]?.message ?? "تحقق من السعرات والماكروز وملاحظات التغذية." });
            return;
          }
          locked.current = true;
          setBusy(true);
          setResult(null);
          try {
            const response = await manage("record_save", { id: (request.current ??= crypto.randomUUID()), client_id: client.id, kind: "nutrition_target", entry_date: day, payload: checked.data });
            setResult(response);
            if (response.ok) {
              request.current = null;
              setDirty(false);
              router.refresh();
            }
          } catch {
            setResult({ ok: false, message: "تعذر الاتصال. لم نتأكد من الحفظ؛ أعد المحاولة بنفس البيانات." });
          } finally {
            locked.current = false;
            setBusy(false);
          }
        }}
      >
        <MacroTargets
          value={values}
          disabled={busy}
          onChange={(next) => {
            setValues(next);
            changed();
          }}
        />
        <label className="block max-w-sm">
          {tr("تاريخ سريان السعرات")}
          <input className="field mt-2" type="date" value={day} disabled={busy} onChange={(event) => { setDay(event.target.value); changed(); }} />
        </label>
        <p className="text-xs text-muted">{tr("الهدف المؤرخ مستقبلًا يبدأ في تاريخه؛ يبقى الهدف الحالي فعالًا حتى ذلك الوقت.")}</p>
        <label className="block">
          {tr("ملاحظات التغذية")}
          <textarea className="field mt-2 min-h-32" maxLength={4000} value={text} disabled={busy} onChange={(event) => { setText(event.target.value); changed(); }} />
        </label>
        <fieldset disabled={busy} className="min-w-0">
          <MealEditor
            nutrition={{ ...values, text, meals }}
            onChange={(nutrition) => {
              setValues(withCaloriesMode({ calories: nutrition.calories, protein: nutrition.protein, carbs: nutrition.carbs, fat: nutrition.fat, calories_mode: values.calories_mode }, values.calories_mode));
              setMeals(nutrition.meals ?? []);
              changed();
            }}
          />
        </fieldset>
        <div className="flex flex-wrap gap-3">
          <button className="btn" type="submit" disabled={busy || !dirty}>{tr(busy ? "جارٍ الحفظ…" : "حفظ السعرات للمتدرب")}</button>
          <Link className="btn-secondary" href={`/coach/clients/${client.id}`}>{tr("العودة لملخص المتدرب")}</Link>
        </div>
        <Notice result={result} />
      </form>
    </section>
  );
}
