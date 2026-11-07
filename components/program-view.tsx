import type { Program } from "@/lib/model";
import { formatDate } from "@/lib/dates";
import { Play, Timer, Utensils } from "lucide-react";
export function ProgramView({ program }: { program: Program | undefined }) {
  if (!program)
    return (
      <div className="empty card">
        <h2 className="text-ink">برنامجك قيد التجهيز</h2>
        <p>سيظهر هنا بعد أن ينشره مدربك. المسودات لا تظهر لك.</p>
      </div>
    );
  return (
    <div className="space-y-6">
      <div className="card p-6">
        <span className="badge bg-accent/40 text-teal">آخر نسخة منشورة</span>
        <h2 className="mt-3 text-xl">{program.name}</h2>
        <p className="mt-1 text-xs text-muted">
          نُشر {formatDate(program.published_at!)} · النسخة {program.version}
        </p>
      </div>
      {program.content.days.map((day, index) => (
        <section className="card overflow-hidden" key={index}>
          <div className="flex items-center gap-3 border-b bg-canvas/50 px-6 py-4">
            <span className="flex size-8 items-center justify-center rounded-lg bg-accent/40 text-sm font-bold text-teal">
              {index + 1}
            </span>
            <h2>{day.name}</h2>
          </div>
          <div className="divide-y divide-line">
            {day.exercises.map((e, i) => (
              <article key={i} className="p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{e.name}</h3>
                    {e.description ? (
                      <p className="mt-2 max-w-2xl text-sm leading-8 text-muted">
                        {e.description}
                      </p>
                    ) : null}
                  </div>
                  {e.video ? (
                    <a
                      href={e.video}
                      rel="noopener noreferrer"
                      target="_blank"
                      className="btn-secondary"
                    >
                      <Play size={14} />
                      شرح الفيديو
                    </a>
                  ) : null}
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <span className="badge">{e.sets} مجموعات</span>
                  <span className="badge">{e.reps} عدات</span>
                  <span className="badge">
                    <Timer size={12} />
                    {e.rest} ثانية راحة
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
      <section className="card p-6">
        <h2 className="flex items-center gap-2">
          <Utensils size={20} className="text-teal" />
          خطة التغذية
        </h2>
        <div className="my-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ["السعرات", program.content.nutrition.calories, "kcal"],
            ["البروتين", program.content.nutrition.protein, "غ"],
            ["الكاربوهيدرات", program.content.nutrition.carbs, "غ"],
            ["الدهون", program.content.nutrition.fat, "غ"],
          ].map(([name, value, unit]) => (
            <div key={String(name)} className="rounded-xl bg-canvas p-4">
              <p className="text-xs text-muted">{name}</p>
              <p className="mt-1 text-xl font-semibold">
                {value || "—"}{" "}
                <span className="text-xs font-normal text-muted">{unit}</span>
              </p>
            </div>
          ))}
        </div>
        <p className="whitespace-pre-wrap leading-9 text-muted">
          {program.content.nutrition.text ||
            "لم يضف المدرب خطة تغذية نصية بعد."}
        </p>
      </section>
    </div>
  );
}
