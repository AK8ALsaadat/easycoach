"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Program } from "@/lib/model";
import { riyadhToday } from "@/lib/dates";
import { useLocale } from "./locale-provider";
import { useUnsavedChanges } from "./use-unsaved-changes";

export function WorkoutSessionForm({ clientId, program, dayIndex, onSaved, onClose }: { clientId: string; program: Program; dayIndex: number; onSaved: () => void; onClose: () => void }) {
  const { t: tr } = useLocale();
  const router = useRouter();
  const day = program.content.days[dayIndex];
  const request = useRef<string | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [dirty, setDirty] = useState(false);
  useUnsavedChanges(dirty);
  return <form className="workout-session-form mt-5 rounded-xl border p-4" data-testid="session-form" onChange={() => setDirty(true)} onSubmit={async event => {
    event.preventDefault();
    if (busy) return;
    const values = new FormData(event.currentTarget);
    setBusy(true); setMessage("");
    try {
      const { manage } = await import("@/app/management-actions");
      const exercises = day.exercises.map((exercise, index) => {
        const set_logs = Array.from({ length: exercise.sets }, (_, set) => ({
          reps: Number(values.get(`reps-${index}-${set}`)),
          ...(values.get(`weight-${index}-${set}`) !== "" ? { weight: Number(values.get(`weight-${index}-${set}`)) } : {}),
        }));
        const counts = set_logs.map(item => item.reps);
        const low = Math.min(...counts), high = Math.max(...counts);
        return { name: exercise.name, sets: set_logs.length, reps: low === high ? String(low) : `${low}–${high}`, set_logs };
      });
      const result = await manage("record_save", { id: request.current ??= crypto.randomUUID(), client_id: clientId, kind: "workout_log", author_type: "client", entry_date: riyadhToday(), payload: { day_name: day.name, completed: true, program_id: program.id, notes: String(values.get("notes") ?? ""), exercises } });
      setMessage(result.ok ? "تم تسجيل الحصة بكل مجموعاتها ✓" : result.message);
      if (result.ok) { request.current = null; setDirty(false); onSaved(); router.refresh(); }
    } catch { setMessage("تعذر الاتصال. بيانات الحصة باقية؛ أعد المحاولة."); }
    finally { setBusy(false); }
  }}>
    <h3>{tr("سجّل هذه الحصة")} · {day.name}</h3>
    <fieldset disabled={busy} className="min-w-0">
      {day.exercises.map((exercise, index) => <section className="mt-4" key={index}><h4>{exercise.name}</h4>
        {Array.from({ length: exercise.sets }, (_, set) => <div className="set-log-row" key={set}><span>{tr("المجموعة")} <bdi dir="ltr">{set + 1}</bdi></span>
          <label>{tr("التكرارات")}<input className="field" type="number" name={`reps-${index}-${set}`} min={1} max={100} step={1} required defaultValue={Number(exercise.reps.match(/\d+/)?.[0]) || 10}/></label>
          <label>{tr("الوزن (كجم)")}<input className="field" type="number" name={`weight-${index}-${set}`} min={0} max={1500} step="0.1" defaultValue={exercise.weight ?? ""}/></label>
        </div>)}
      </section>)}
      <label className="block mt-4">{tr("ملاحظات السجل")}<textarea name="notes" className="field" maxLength={4000}/></label>
      <div className="mt-4 flex gap-2"><button className="btn" disabled={busy}>{tr(busy ? "جارٍ الحفظ…" : "حفظ الحصة")}</button><button type="button" className="btn-secondary" onClick={onClose}>{tr("إغلاق")}</button></div>
    </fieldset>
    {message && <p role="status" className="mt-3 text-sm">{tr(message)}</p>}
  </form>;
}
