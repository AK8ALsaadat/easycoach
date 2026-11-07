"use client";
import { Plus, Trash2, Copy, Utensils } from "lucide-react";
import type { Content } from "@/lib/model";
type Nutrition = Content["nutrition"];
export function MealEditor({
  nutrition,
  onChange,
}: {
  nutrition: Nutrition;
  onChange: (n: Nutrition) => void;
}) {
  const meals = nutrition.meals ?? [];
  const total = meals.reduce(
    (s, m) => ({
      calories: s.calories + m.calories,
      protein: s.protein + m.protein,
      carbs: s.carbs + m.carbs,
      fat: s.fat + m.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
  function update(i: number, k: string, v: string | number) {
    onChange({
      ...nutrition,
      meals: meals.map((m, j) => (i === j ? { ...m, [k]: v } : m)),
    });
  }
  return (
    <section className="space-y-4">
      <div className="section-title">
        <div>
          <p className="eyebrow">MEAL BUILDER</p>
          <h2>وزّع اليوم على وجبات</h2>
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
                  name:
                    ["الفطور", "الغداء", "العشاء", "سناك"][meals.length] ??
                    `وجبة ${meals.length + 1}`,
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
          وجبة
        </button>
      </div>
      {meals.map((m, i) => (
        <article className="meal-card" key={i}>
          <div className="mb-4 flex gap-3">
            <span className="meal-number">
              {String(i + 1).padStart(2, "0")}
            </span>
            <input
              aria-label={`اسم الوجبة ${i + 1}`}
              className="field"
              value={m.name}
              maxLength={100}
              onChange={(e) => update(i, "name", e.target.value)}
            />
            <input
              aria-label={`وقت الوجبة ${i + 1}`}
              className="field max-w-36"
              value={m.time}
              placeholder="مثال: 8 صباحًا"
              maxLength={40}
              onChange={(e) => update(i, "time", e.target.value)}
            />
            <button
              aria-label={`نسخ الوجبة ${i + 1}`}
              type="button"
              className="btn-secondary"
              disabled={meals.length >= 12}
              onClick={() =>
                onChange({
                  ...nutrition,
                  meals: [...meals, { ...m, name: m.name + " · نسخة" }],
                })
              }
            >
              <Copy size={15} />
            </button>
            <button
              aria-label={`حذف الوجبة ${i + 1}`}
              type="button"
              className="btn-secondary"
              onClick={() =>
                onChange({
                  ...nutrition,
                  meals: meals.filter((_, j) => j !== i),
                })
              }
            >
              <Trash2 size={15} />
            </button>
          </div>
          <textarea
            aria-label={`مكونات الوجبة ${i + 1}`}
            className="field min-h-24"
            value={m.foods}
            placeholder="150غ دجاج مشوي، 180غ أرز مطبوخ، سلطة… وحدد البدائل والكميات بالطريقة اللي تناسب عميلك."
            maxLength={2000}
            onChange={(e) => update(i, "foods", e.target.value)}
          />
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
                {label}
                <input
                  aria-label={`${label} الوجبة ${i + 1}`}
                  className="field mt-1"
                  type="number"
                  min={0}
                  max={k === "calories" ? 10000 : 1000}
                  value={m[k]}
                  onChange={(e) => update(i, k, Number(e.target.value))}
                />
              </label>
            ))}
          </div>
        </article>
      ))}
      {meals.length ? (
        <div className="nutrition-reconcile">
          <div className="flex items-center gap-3">
            <Utensils size={20} />
            <div>
              <strong>مجموع الوجبات: {total.calories} kcal</strong>
              <p className="text-xs">
                P {total.protein}g · C {total.carbs}g · F {total.fat}g
              </p>
            </div>
          </div>
          <div className="text-sm">
            {total.calories === nutrition.calories
              ? "يطابق هدف السعرات"
              : `فرق ${total.calories - nutrition.calories} kcal عن الهدف`}
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => onChange({ ...nutrition, ...total })}
          >
            اعتمد المجموع كأهداف
          </button>
        </div>
      ) : (
        <p className="py-5 text-sm text-muted">
          إضافة الوجبات اختيارية. تقدر تكتفي بالأهداف والملاحظات.
        </p>
      )}
    </section>
  );
}
