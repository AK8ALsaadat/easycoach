"use client";
import { emptyMeal } from "@/lib/program-validation";
import { useLocale } from "./locale-provider";
import type { Program, Content } from "@/lib/model";
import { Utensils } from "lucide-react";
import { WeeklyProgram } from "./weekly-program";
import { MacroSplitBar } from "./macro-targets";
export function ProgramView({
  program,
  portalHash,
  nutrition,
  clientId,
  section = "all",
}: {
  program: Program | undefined;
  portalHash?: string;
  nutrition?: Content["nutrition"];
  focusToday?: boolean;
  clientId?: string;
  /** Lets the trainee page place training and nutrition separately (mobile priority order). */
  section?: "all" | "training" | "nutrition";
}) {
  const { t: tr } = useLocale();
  const nutritionPlan = section === "training" ? undefined : nutrition ?? program?.content.nutrition;
  const filledMeals = (nutritionPlan?.meals ?? []).filter((meal) => !emptyMeal(meal));
  return (
    <div className="space-y-6">
      {section !== "nutrition" && (program ? <WeeklyProgram key={program.id} program={program} portalHash={portalHash} clientId={clientId}/> : <div className="empty card"><h2>{tr("برنامجك قيد التجهيز")}</h2><p>{tr("سيظهر هنا بعد أن ينشره مدربك. المسودات لا تظهر لك.")}</p></div>)}
      {nutritionPlan && <section className="card p-6">
        <h2 className="flex items-center gap-2">
          <Utensils size={20} className="text-teal" />
          {tr("خطة التغذية")}
        </h2>
        <div className="my-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            [tr("السعرات"), nutritionPlan.calories, tr("سعرة")],
            [tr("البروتين"), nutritionPlan.protein, tr("غ")],
            [tr("الكاربوهيدرات"), nutritionPlan.carbs, tr("غ")],
            [tr("الدهون"), nutritionPlan.fat, tr("غ")],
          ].map(([name, value, unit]) => (
            <div key={String(name)} className="rounded-xl bg-canvas p-4">
              <p className="text-xs text-muted">{name}</p>
              <p className="mt-1 text-xl font-semibold">
                <bdi dir="ltr">{value || "—"}</bdi>{" "}
                <span className="text-xs font-normal text-muted">{unit}</span>
              </p>
            </div>
          ))}
        </div>
        <MacroSplitBar value={nutritionPlan} className="mb-5" />
        {(nutritionPlan.text || !filledMeals.length) && <p className="whitespace-pre-wrap leading-9 text-muted">
          {nutritionPlan.text || tr("لم يضف المدرب خطة تغذية نصية بعد.")}
        </p>}
        {/* A meal with no foods and every value at zero is a row the coach has
            not filled in yet. Showing it as "الفطور · 0 سعرة" read as a plan
            of nothing; it is left out, and if they are all empty we say so. */}
        {filledMeals.length ? (
          <div className="mt-6 space-y-3">
            {filledMeals.map((m, i) => (
              <article key={i} className="meal-card">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-bold">{m.name}</h3>
                  <span className="text-xs text-muted">{m.time}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-8">
                  {m.foods}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="badge">
                    {m.calories} {tr("سعرة")}
                  </span>
                  <span className="badge">
                    {tr("بروتين")} {m.protein} {tr("غ")}
                  </span>
                  <span className="badge">
                    {tr("كارب")} {m.carbs} {tr("غ")}
                  </span>
                  <span className="badge">
                    {tr("دهون")} {m.fat} {tr("غ")}
                  </span>
                </div>
              </article>
            ))}
          </div>
        ) : nutritionPlan.meals?.length ? (
          <p className="mt-6 text-sm text-muted">{tr("ما حدّد مدربك وجبات بعد. الماكروز أعلى هي هدفك اليومي.")}</p>
        ) : null}
      </section>}
    </div>
  );
}
