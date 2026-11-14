"use client";
import { DateInput } from "./date-input";
import { useState, useSyncExternalStore } from "react";
import { changeProgressRecord } from "@/app/progress-record-actions";
import type { CoachingRecord } from "@/lib/management";
import { riyadhToday } from "@/lib/dates";
import { useLocale } from "./locale-provider";
const measurements = [
  ["weight", "الوزن (كجم)", 20, 400], ["body_fat", "نسبة الدهون (%)", 0, 100],
  ["waist", "الخصر (سم)", 1, 300], ["chest", "الصدر (سم)", 1, 300],
  ["hips", "الحوض (سم)", 1, 300], ["arm", "الذراع (سم)", 1, 200],
  ["thigh", "الفخذ (سم)", 1, 200], ["calf", "الساق (سم)", 1, 120],
] as const;
const checkinFields = [["weight", "الوزن (كجم)", 20, 400], ["sleep", "النوم", 1, 5], ["energy", "الطاقة", 1, 5], ["hunger", "الجوع", 1, 5], ["stress", "التوتر", 1, 5], ["training_adherence", "التزام التدريب (%)", 0, 100], ["nutrition_adherence", "التزام التغذية (%)", 0, 100]] as const;
const subscribeHydration = () => () => {};
export function ProgressRecordControls({ record, coach, portalReference, onUpdate }: { record: CoachingRecord; coach: boolean; portalReference?: string; onUpdate: () => Promise<unknown> }) {
  const { t, language } = useLocale();
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  // Do not accept edits before React attaches handlers to the server HTML.
  // Otherwise a slow hydration can replace an uncontrolled field after typing.
  const hydrated = useSyncExternalStore(subscribeHydration, () => true, () => false);
  const locked = busy || !hydrated;
  const allowed = !record.payload.historical_only && (coach || record.author_type === "client");
  const fields = record.kind === "measurement" ? measurements : checkinFields;
  const timestamp = (value: string) => new Date(value).toLocaleString(language === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { timeZone: "Asia/Riyadh" });
  async function save(command: "edit" | "delete" | "review", form?: FormData) {
    setBusy(true); setMessage("");
    try {
      const payload = { ...record.payload };
      if (form) {
        for (const [key] of fields) {
          const value = form.get(key);
          if (value === null || value === "") delete payload[key];
          else payload[key] = Number(value);
        }
        if (record.kind === "measurement") payload.notes = String(form.get("notes") ?? "");
        else { payload.feedback = String(form.get("feedback") ?? ""); payload.questions = String(form.get("questions") ?? ""); }
      }
      const result = await changeProgressRecord({
        command, client_id: record.client_id, id: record.id, kind: record.kind,
        expected_updated_at: record.updated_at ?? record.created_at,
        ...(form ? command === "review" ? { payload: { feedback: String(form.get("coach_feedback") ?? "") } } : { entry_date: String(form.get("entry_date")), payload } : {}),
      }, portalReference);
      setMessage(result.message);
      if (result.ok) await onUpdate();
    } catch { setMessage("تعذر الاتصال. احتفظ بتعديلاتك وحدّث السجل قبل إعادة المحاولة."); }
    finally { setBusy(false); }
  }
  return <div className="mt-3 space-y-2 text-xs">
    <p className="text-muted">{t("أضافه")}: {t(record.author_type === "coach" ? "المدرب" : "المتدرب")} · {t("الإنشاء")}: {timestamp(record.created_at)}</p>
    {record.updated_at && record.updated_at !== record.created_at && <p className="text-muted">{t("آخر تعديل")}: {timestamp(record.updated_at)} · {t(record.modified_by_type === "coach" ? "المدرب" : "المتدرب")} · {t("الإصدار")}: {record.revision ?? 1}</p>}
    {record.kind === "measurement" && record.coach_feedback && <div className="rounded-lg bg-accent p-3"><strong>{t("رد المدرب — ظاهر للمتدرب")}</strong><p className="mt-1 whitespace-pre-wrap">{record.coach_feedback}</p></div>}
    {record.kind === "measurement" && coach && !record.payload.historical_only && <form className="space-y-2" onSubmit={event => { event.preventDefault(); void save("review", new FormData(event.currentTarget)); }}><label className="block">{t("رد المدرب على التحديث (ظاهر للمتدرب)")}<textarea className="field" name="coach_feedback" maxLength={4000} defaultValue={record.coach_feedback} disabled={locked} /></label><button className="btn-secondary" disabled={locked}>{t("حفظ الرد على التحديث")}</button><p className="text-muted">{t("استخدم تبويب الملاحظات الخاصة لما لا ترغب في مشاركته مع المتدرب.")}</p></form>}
    {allowed && <details className="rounded-lg border p-3">
      <summary>{t("تصحيح التحديث أو حذفه")}</summary>
      <form className="mt-3 space-y-3" onSubmit={event => { event.preventDefault(); void save("edit", new FormData(event.currentTarget)); }}>
        <fieldset disabled={locked} className="min-w-0 space-y-3">
          <label className="block">{t("تاريخ التحديث")}<DateInput className="field" type="date" name="entry_date" defaultValue={record.entry_date} max={riyadhToday()} required /></label>
          <div className="grid gap-3 sm:grid-cols-2">{fields.map(([key, label, min, max]) => <label key={key}>{t(label)}<input className="field" type="number" name={key} min={min} max={max} step={record.kind === "checkin" && key !== "weight" ? "1" : "0.1"} required={record.kind === "checkin" && key !== "weight"} defaultValue={typeof record.payload[key] === "number" ? String(record.payload[key]) : ""} /></label>)}</div>
          {record.kind === "measurement" ? <label className="block">{t("الملاحظات")}<textarea className="field" name="notes" maxLength={4000} defaultValue={String(record.payload.notes ?? "")} /></label> : <><label className="block">{t("ملاحظات المتدرب")}<textarea className="field" name="feedback" maxLength={4000} defaultValue={String(record.payload.feedback ?? "")} /></label><label className="block">{t("أسئلة أو صعوبات")}<textarea className="field" name="questions" maxLength={4000} defaultValue={String(record.payload.questions ?? "")} /></label></>}
          <p className="text-muted">{t("التصحيح يحفظ إسناد التحديث ووقت تعديله. الحذف يزيل سجل التحديث وتصحيحاته، ولا يحذف صورًا مستقلة سبق رفعها.")}</p>
          <div className="flex flex-wrap gap-3"><button className="btn-secondary" disabled={busy}>{t(busy ? "جارٍ الحفظ…" : "حفظ التصحيح")}</button><button className="btn-secondary" type="button" disabled={busy} onClick={() => { if (window.confirm("حذف هذا التحديث وتصحيحاته نهائيًا؟ الصور المستقلة لا تُحذف بهذه العملية.")) void save("delete"); }}>{t("حذف التحديث")}</button></div>
        </fieldset>
      </form>
    </details>}
    {message && <p role="status">{t(message)}</p>}
  </div>;
}
