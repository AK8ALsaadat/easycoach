"use client";
import { useLocale } from "./locale-provider";
import { useState } from "react";
import { Plus, Trash2, Copy, Utensils } from "lucide-react";
import { ConfirmDialog } from "./modal";
import type { Content } from "@/lib/model";
import { caloriesFromMacros, MACRO_LIMITS, remainingAgainstTarget, sumMeals } from "@/lib/macros";
import { formatNumber } from "@/lib/plural";
import { DecimalInput } from "./decimal-input";
type Nutrition = Content["nutrition"];
type Meal = NonNullable<Nutrition["meals"]>[number];

/** Remaining (+) or over (−) against the daily target, per macro. */
function Balance({ label, unit, value }: { label: string; unit: string; value: number }) {
  const { t: tr } = useLocale();
  const state = Math.abs(value) < 0.05 ? "even" : value > 0 ? "left" : "over";
  return (
    <span className={`meal-balance meal-balance-${state}`}>
      <span>{tr(label)}</span>
      <strong>
        {state === "even" ? tr("مطابق") : tr(state === "left" ? "متبقي {0}" : "زيادة {0}", "")}
        {state !== "even" && <bdi dir="ltr"> {formatNumber(Math.abs(value))} {tr(unit)}</bdi>}
      </strong>
    </span>
  );
}

export function MealEditor({
  nutrition,
  onChange,
  includeTargets = true,
}: {
  nutrition: Nutrition;
  onChange: (n: Nutrition) => void;
  includeTargets?: boolean;
}) {
  const { t: tr } = useLocale();
  const auto = nutrition.calories_mode === "auto";
  const meals = nutrition.meals ?? [];
  const total = sumMeals(meals);
  const remaining = remainingAgainstTarget(nutrition, total);
  const [confirmTargets, setConfirmTargets] = useState(false);
  const mealsEmpty = [total.calories, total.protein, total.carbs, total.fat].every((value) => !value);
  const applyTotals = () => {
    onChange({
      ...nutrition,
      protein: total.protein,
      carbs: total.carbs,
      fat: total.fat,
      calories: auto ? caloriesFromMacros(total) : Math.round(total.calories * 10) / 10,
    });
    setConfirmTargets(false);
  };
  function update(i: number, k: keyof Meal, v: string | number) {
    onChange({
      ...nutrition,
      meals: meals.map((m, j) => {
        if (i !== j) return m;
        const next = { ...m, [k]: v };
        // In auto mode each meal's calories follow its macros, like the daily target.
        return auto && k !== "calories" ? { ...next, calories: caloriesFromMacros(next) } : next;
      }),
    });
  }
  return (
    <section className="space-y-4">
      <div className="section-title">
        <div>
          <p className="eyebrow">{tr("خطة الوجبات")}</p>
          <h2>{tr("وزّع اليوم على وجبات")}</h2>
        </div>
        <button
          type="button"
          className="btn-secondary"
          disabled={meals.length >= 12}
          onClick={() =>
            onChange({
              ...nutrition,
              meals: [
                ...meals,
                {
                  name: ["الفطور", "الغداء", "العشاء", "سناك"][meals.length] ?? `وجبة ${meals.length + 1}`,
                  time: "",
                  foods: "",
                  calories: 0,
                  protein: 0,
                  carbs: 0,
                  fat: 0,
                },
              ],
            })
          }
        >
          <Plus size={16} />
          {tr("وجبة")}
        </button>
      </div>
      {meals.map((m, i) => (
        <article className="meal-card" key={i}>
          <div className="meal-card-head mb-4 flex gap-3">
            <span className="meal-number">{i + 1}</span>
            <input
              id={`meal-${i}-name`}
              aria-label={tr("اسم الوجبة {0}", String(i + 1))}
              className="field"
              value={m.name}
              maxLength={100}
              onChange={(e) => update(i, "name", e.target.value)}
            />
            <input
              aria-label={tr("وقت الوجبة {0}", String(i + 1))}
              className="field max-w-36"
              value={m.time}
              placeholder={tr("مثال: 8 صباحًا")}
              maxLength={40}
              onChange={(e) => update(i, "time", e.target.value)}
            />
            <button
              aria-label={tr("نسخ الوجبة {0}", String(i + 1))}
              type="button"
              className="btn-secondary"
              disabled={meals.length >= 12}
              onClick={() => onChange({ ...nutrition, meals: [...meals, { ...m, name: m.name + " · نسخة" }] })}
            >
              <Copy size={15} />
            </button>
            <button
              aria-label={tr("حذف الوجبة {0}", String(i + 1))}
              type="button"
              className="btn-secondary"
              onClick={() => onChange({ ...nutrition, meals: meals.filter((_, j) => j !== i) })}
            >
              <Trash2 size={15} />
            </button>
          </div>
          <textarea
            aria-label={tr("مكونات الوجبة {0}", String(i + 1))}
            className="field min-h-24"
            value={m.foods}
            placeholder={tr("150غ دجاج مشوي، 180غ أرز مطبوخ، سلطة… وحدد البدائل والكميات بالطريقة اللي تناسب متدربك.")}
            maxLength={2000}
            onChange={(e) => update(i, "foods", e.target.value)}
          />
          {includeTargets && (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(
                [
                  ["calories", "سعرات"],
                  ["protein", "بروتين (غ)"],
                  ["carbs", "كارب (غ)"],
                  ["fat", "دهون (غ)"],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="text-xs text-muted">
                  {tr(label)}
                  <DecimalInput
                    aria-label={tr("{0} الوجبة {1}", String(tr(label)), String(i + 1))}
                    className="field mt-1"
                    max={k === "calories" ? MACRO_LIMITS.calories : MACRO_LIMITS.grams}
                    readOnly={k === "calories" && auto}
                    value={k === "calories" && auto ? caloriesFromMacros(m) : m[k]}
                    onValue={(value) => update(i, k, value)}
                  />
                </label>
              ))}
            </div>
          )}
        </article>
      ))}
      {meals.length && includeTargets ? (
        <div className="nutrition-reconcile">
          <div className="flex items-center gap-3">
            <Utensils size={20} />
            <div>
              <strong>
                {tr("مجموع الوجبات:")} <bdi>{formatNumber(total.calories)}</bdi> {tr("سعرة")}
              </strong>
              <p className="text-xs">
                {tr("بروتين")} <bdi>{formatNumber(total.protein)}</bdi>{tr("غ")} · {tr("كارب")} <bdi>{formatNumber(total.carbs)}</bdi>{tr("غ")} · {tr("دهون")} <bdi>{formatNumber(total.fat)}</bdi>{tr("غ")}
              </p>
            </div>
          </div>
          <div className="meal-balances" aria-label={tr("مقارنة الوجبات بالهدف اليومي")}>
            <Balance label="السعرات" unit="سعرة" value={remaining.calories} />
            <Balance label="بروتين" unit="غ" value={remaining.protein} />
            <Balance label="كارب" unit="غ" value={remaining.carbs} />
            <Balance label="دهون" unit="غ" value={remaining.fat} />
          </div>
          <button
            type="button"
            className="btn-secondary"
            disabled={mealsEmpty}
            aria-describedby={mealsEmpty ? "meals-empty-hint" : undefined}
            onClick={() => setConfirmTargets(true)}
          >
            {tr("اعتمد المجموع كأهداف")}
          </button>
          {mealsEmpty && <p id="meals-empty-hint" className="form-hint">{tr("أدخل قيم الوجبات أولًا؛ مجموعها الآن صفر.")}</p>}
          <ConfirmDialog
            open={confirmTargets}
            title={tr("استبدال الأهداف اليومية؟")}
            confirmLabel="استبدل الأهداف"
            onConfirm={applyTotals}
            onClose={() => setConfirmTargets(false)}
          >
            {tr("ستصبح الأهداف: {0} سعرة · بروتين {1}غ · كارب {2}غ · دهون {3}غ. الأهداف الحالية ({4} سعرة) تُستبدل.", formatNumber(auto ? caloriesFromMacros(total) : total.calories), formatNumber(total.protein), formatNumber(total.carbs), formatNumber(total.fat), formatNumber(nutrition.calories))}
          </ConfirmDialog>
        </div>
      ) : (
        <p className="py-5 text-sm text-muted">
          {tr(includeTargets ? "إضافة الوجبات اختيارية. تقدر تكتفي بالأهداف والملاحظات." : "إضافة الوجبات اختيارية. الأهداف الغذائية تُخصص لاحقًا لكل متدرب من ملفه.")}
        </p>
      )}
    </section>
  );
}
