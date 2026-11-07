"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Plus, Save, Send, Trash2 } from "lucide-react";
import {
  content as contentSchema,
  type Content,
  type Exercise,
} from "@/lib/model";
import { mutate, type Result } from "@/app/actions";
import { Notice } from "./forms";

export function ProgramEditor({
  initial,
  name: initialName,
  id,
  clientId,
  library = [],
}: {
  initial: Content;
  name: string;
  id?: string;
  clientId?: string;
  library?: Exercise[];
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [plan, setPlan] = useState<Content>(() => structuredClone(initial));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [day, setDay] = useState(0);
  const [tab, setTab] = useState<"training" | "nutrition">("training");
  const [hasSaved, setHasSaved] = useState(Boolean(id));
  const savedId = useRef(id);
  const revision = useRef(0);
  const lock = useRef(false);
  function changed() {
    revision.current++;
    setDirty(true);
    setResult(null);
  }
  function edit(update: (value: Content) => Content) {
    setPlan(update);
    changed();
  }
  const save = useCallback(async () => {
    if (lock.current) return null;
    const check = contentSchema.safeParse(plan);
    if (!check.success || name.trim().length < 2) {
      setResult({
        ok: false,
        message: "أكمل اسم البرنامج وأسماء التمارين والمجموعات قبل الحفظ.",
      });
      return null;
    }
    lock.current = true;
    setBusy(true);
    const rev = revision.current;
    try {
      const response = await mutate(
        clientId ? "program_save" : "template_save",
        clientId
          ? { client_id: clientId, name, content: check.data }
          : { id: savedId.current, name, content: check.data },
      );
      setResult(response);
      if (response.ok) {
        savedId.current = (response.data as { id: string }).id;
        setHasSaved(true);
        if (rev === revision.current) setDirty(false);
        return savedId.current;
      }
      return null;
    } catch {
      setResult({
        ok: false,
        message: "تعذر حفظ المسودة. حافظ على الصفحة مفتوحة وأعد المحاولة.",
      });
      return null;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }, [plan, name, clientId]);
  useEffect(() => {
    if (!dirty || busy || result?.ok === false) return;
    const timer = setTimeout(() => {
      void save();
    }, 1200);
    return () => clearTimeout(timer);
  }, [dirty, busy, save, result]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const active = plan.days[day] ?? plan.days[0];
  function updateExercise(
    index: number,
    field: string,
    value: string | number,
  ) {
    edit((current) => ({
      ...current,
      days: current.days.map((d, i) =>
        i === day
          ? {
              ...d,
              exercises: d.exercises.map((e, j) =>
                j === index ? { ...e, [field]: value } : e,
              ),
            }
          : d,
      ),
    }));
  }
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-60 flex-1">
          <label htmlFor="plan-name">
            اسم {clientId ? "البرنامج" : "القالب"}
          </label>
          <input
            id="plan-name"
            className="field"
            value={name}
            maxLength={140}
            onChange={(e) => {
              setName(e.target.value);
              changed();
            }}
          />
        </div>
        <span role="status" className="badge">
          {busy
            ? "نحفظ المسودة…"
            : dirty
              ? "تعديلات لم تُحفظ بعد"
              : hasSaved
                ? "المسودة محفوظة"
                : "مسودة جديدة"}
        </span>
      </div>
      <div className="flex flex-wrap gap-2 border-b pb-4">
        <button
          type="button"
          className={tab === "training" ? "btn" : "btn-secondary"}
          onClick={() => setTab("training")}
        >
          البرنامج التدريبي
        </button>
        <button
          type="button"
          className={tab === "nutrition" ? "btn" : "btn-secondary"}
          onClick={() => setTab("nutrition")}
        >
          التغذية والأهداف
        </button>
      </div>
      {tab === "nutrition" ? (
        <div className="space-y-5">
          <p className="text-sm text-muted">
            أهداف يحددها المدرب. لا نجمع قياسات أو بيانات طبية.
          </p>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {(
              [
                ["calories", "السعرات (kcal)"],
                ["protein", "البروتين (غ)"],
                ["carbs", "الكاربوهيدرات (غ)"],
                ["fat", "الدهون (غ)"],
              ] as const
            ).map(([field, label]) => (
              <div key={field}>
                <label htmlFor={`nutrition-${field}`}>{label}</label>
                <input
                  id={`nutrition-${field}`}
                  type="number"
                  min={0}
                  max={field === "calories" ? 10000 : 1000}
                  className="field"
                  value={plan.nutrition[field]}
                  onChange={(e) =>
                    edit((c) => ({
                      ...c,
                      nutrition: {
                        ...c.nutrition,
                        [field]: Number(e.target.value),
                      },
                    }))
                  }
                />
              </div>
            ))}
          </div>
          <label htmlFor="nutrition-text">الخطة والملاحظات الغذائية</label>
          <textarea
            id="nutrition-text"
            className="field min-h-56"
            maxLength={10000}
            value={plan.nutrition.text}
            onChange={(e) =>
              edit((c) => ({
                ...c,
                nutrition: { ...c.nutrition, text: e.target.value },
              }))
            }
          />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {plan.days.map((d, i) => (
              <button
                type="button"
                key={i}
                className={day === i ? "btn-soft" : "btn-secondary"}
                onClick={() => setDay(i)}
              >
                {d.name}
              </button>
            ))}
            <button
              type="button"
              className="btn-secondary"
              disabled={plan.days.length >= 14}
              onClick={() => {
                const index = plan.days.length;
                edit((c) => ({
                  ...c,
                  days: [
                    ...c.days,
                    {
                      name: `اليوم ${index + 1}`,
                      exercises: [
                        {
                          name: "تمرين جديد",
                          description: "",
                          video: "",
                          sets: 3,
                          reps: "10",
                          rest: 60,
                        },
                      ],
                    },
                  ],
                }));
                setDay(index);
              }}
            >
              <Plus size={16} />
              يوم
            </button>
          </div>
          <div className="flex flex-wrap gap-3">
            <input
              aria-label="اسم اليوم"
              className="field max-w-sm"
              value={active.name}
              maxLength={100}
              onChange={(e) =>
                edit((c) => ({
                  ...c,
                  days: c.days.map((d, i) =>
                    i === day ? { ...d, name: e.target.value } : d,
                  ),
                }))
              }
            />
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                if (plan.days.length >= 14) return;
                edit((c) => ({
                  ...c,
                  days: [...c.days, structuredClone(active)],
                }));
                setDay(plan.days.length);
              }}
            >
              <Copy size={16} />
              نسخ اليوم
            </button>
            <button
              type="button"
              className="btn-secondary text-red-700"
              disabled={plan.days.length === 1}
              onClick={() => {
                edit((c) => ({
                  ...c,
                  days: c.days.filter((_, i) => i !== day),
                }));
                setDay(0);
              }}
            >
              <Trash2 size={16} />
              حذف اليوم
            </button>
          </div>
          <div className="space-y-4">
            {active.exercises.map((e, i) => (
              <div key={i} className="rounded-xl border bg-canvas/60 p-4">
                <div className="mb-4 flex items-center gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white text-xs font-bold text-teal">
                    {i + 1}
                  </span>
                  <input
                    aria-label={`اسم التمرين ${i + 1}`}
                    className="field"
                    value={e.name}
                    maxLength={140}
                    onChange={(event) =>
                      updateExercise(i, "name", event.target.value)
                    }
                  />
                  <button
                    type="button"
                    aria-label={`حذف التمرين ${i + 1}`}
                    className="text-muted hover:text-red-600"
                    disabled={active.exercises.length === 1}
                    onClick={() =>
                      edit((c) => ({
                        ...c,
                        days: c.days.map((d, j) =>
                          j === day
                            ? {
                                ...d,
                                exercises: d.exercises.filter(
                                  (_, n) => n !== i,
                                ),
                              }
                            : d,
                        ),
                      }))
                    }
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {(
                    [
                      ["sets", "المجموعات"],
                      ["reps", "العدات"],
                      ["rest", "الراحة (ثانية)"],
                    ] as const
                  ).map(([f, label]) => (
                    <div key={f}>
                      <label htmlFor={`ex-${i}-${f}`}>{label}</label>
                      <input
                        id={`ex-${i}-${f}`}
                        className="field"
                        type={f === "reps" ? "text" : "number"}
                        min={f === "sets" ? 1 : 0}
                        max={f === "sets" ? 20 : f === "rest" ? 600 : undefined}
                        value={e[f]}
                        onChange={(event) =>
                          updateExercise(
                            i,
                            f,
                            f === "reps"
                              ? event.target.value
                              : Number(event.target.value),
                          )
                        }
                      />
                    </div>
                  ))}
                </div>
                <details className="mt-4">
                  <summary className="text-xs text-muted">
                    شرح الحركة ورابط الفيديو
                  </summary>
                  <label className="mt-3" htmlFor={`ex-description-${i}`}>
                    الشرح
                  </label>
                  <textarea
                    id={`ex-description-${i}`}
                    className="field"
                    maxLength={2000}
                    value={e.description}
                    onChange={(event) =>
                      updateExercise(i, "description", event.target.value)
                    }
                  />
                  <label className="mt-3" htmlFor={`ex-video-${i}`}>
                    رابط فيديو اختياري (https)
                  </label>
                  <input
                    id={`ex-video-${i}`}
                    className="field"
                    type="url"
                    value={e.video}
                    onChange={(event) =>
                      updateExercise(i, "video", event.target.value)
                    }
                  />
                </details>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn-secondary"
              disabled={active.exercises.length >= 40}
              onClick={() =>
                edit((c) => ({
                  ...c,
                  days: c.days.map((d, i) =>
                    i === day
                      ? {
                          ...d,
                          exercises: [
                            ...d.exercises,
                            {
                              name: "تمرين جديد",
                              description: "",
                              video: "",
                              sets: 3,
                              reps: "10",
                              rest: 60,
                            },
                          ],
                        }
                      : d,
                  ),
                }))
              }
            >
              <Plus size={16} />
              تمرين جديد
            </button>
            {library.length ? (
              <select
                aria-label="إضافة من مكتبة التمارين"
                className="field max-w-xs"
                value=""
                onChange={(event) => {
                  const ex = library.find((x) => x.id === event.target.value);
                  if (ex && active.exercises.length < 40)
                    edit((c) => ({
                      ...c,
                      days: c.days.map((d, i) =>
                        i === day
                          ? {
                              ...d,
                              exercises: [
                                ...d.exercises,
                                {
                                  name: ex.name,
                                  description: ex.description,
                                  video: ex.video,
                                  sets: 3,
                                  reps: "10",
                                  rest: 60,
                                },
                              ],
                            }
                          : d,
                      ),
                    }));
                }}
              >
                <option value="">إضافة نسخة من المكتبة…</option>
                {library.map((e) => (
                  <option value={e.id} key={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        </>
      )}
      <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white/95 p-4 shadow-lg backdrop-blur">
        <p className="max-w-md text-xs text-muted">
          {clientId
            ? "المسودة خاصة بك. المتدرب يرى آخر نسخة منشورة فقط. النشر لا يغيّر أي عميل آخر."
            : "التعديلات هنا لا تغيّر أي برنامج سبق نسخه لعميل."}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={() => void save()}
          >
            <Save size={16} />
            حفظ المسودة
          </button>
          {clientId ? (
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={async () => {
                const draftId = await save();
                if (!draftId) return;
                const response = await mutate("program_publish", {
                  id: draftId,
                });
                setResult(response);
                if (response.ok) {
                  savedId.current = undefined;
                  setResult({
                    ok: true,
                    message: "تم النشر. المتدرب يرى هذه النسخة الآن.",
                  });
                  router.refresh();
                }
              }}
            >
              <Send size={16} />
              نشر للمتدرب
            </button>
          ) : (
            <span className="hidden items-center gap-1 text-xs text-teal sm:flex">
              <Check size={14} />
              نسخة مستقلة
            </span>
          )}
        </div>
      </div>
      <Notice result={result} />
    </div>
  );
}
