"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dumbbell, Plus, Trash2, Video, X } from "lucide-react";
import { mutate, type Result } from "@/app/actions";
import type { Snapshot } from "@/lib/model";
import { useLocale } from "./locale-provider";
import { Notice } from "./forms";
import { ConfirmDialog } from "./modal";
import { VideoUpload } from "./video-upload";
import { ExerciseVideo, ExerciseVideoLink } from "./exercise-video";
import { showToast } from "./toast";

/**
 * Exercises the coach wrote. Each one can carry an uploaded clip (phone QR
 * included) and written instructions, both of which travel into a program when
 * the exercise is added there, and each can be deleted: a program already built
 * from one keeps its own copy, so nothing a trainee sees disappears.
 */
export function CustomExercises({ data }: { data: Snapshot }) {
  const { t: tr } = useLocale();
  const router = useRouter();
  const [editing, setEditing] = useState("");
  const current = data.exercises.find((item) => item.id === editing);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [video, setVideo] = useState("");
  const [mediaId, setMediaId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [removing, setRemoving] = useState("");

  function load(id: string) {
    const exercise = data.exercises.find((item) => item.id === id);
    setEditing(id);
    setName(exercise?.name ?? "");
    setDescription(exercise?.description ?? "");
    setVideo(exercise?.video ?? "");
    setMediaId(exercise?.media_id ?? null);
    setResult(null);
  }
  function clear() {
    setEditing("");
    setName("");
    setDescription("");
    setVideo("");
    setMediaId(null);
    setResult(null);
  }

  async function save() {
    setBusy(true);
    setResult(null);
    try {
      const response = await mutate("exercise_save", {
        ...(editing ? { id: editing } : {}),
        name: name.trim(),
        description,
        video: video.trim(),
        media_id: mediaId,
      });
      setResult(response);
      if (response.ok) {
        showToast({ message: tr(editing ? "تم تحديث التمرين ✓" : "تمت إضافة التمرين ✓"), tone: "success" });
        // An empty form is the signal that the save landed; leaving the old
        // values in place made a successful save look like nothing happened.
        clear();
        router.refresh();
      }
    } catch {
      setResult({ ok: false, message: "تعذر الاتصال. حافظ على الصفحة مفتوحة وأعد المحاولة." });
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      const response = await mutate("exercise_delete", { id });
      setResult(response);
      setRemoving("");
      if (response.ok) {
        if (editing === id) clear();
        showToast({ message: tr("تم حذف التمرين من مكتبتك"), tone: "success" });
        router.refresh();
      }
    } catch {
      setResult({ ok: false, message: "تعذر الاتصال. أعد المحاولة." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(300px,1fr)]">
      <section className="card divide-y divide-line">
        {data.exercises.length ? (
          data.exercises.map((exercise) => (
            <article key={exercise.id} className="p-5">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-canvas text-muted">
                  {exercise.media_id ? <Video size={18} /> : <Dumbbell size={18} />}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="flex flex-wrap items-center gap-2 font-medium">
                    {exercise.name}
                    <span className="badge">{tr("خاص بك")}</span>
                  </h3>
                  {exercise.description ? (
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-7 text-muted">{exercise.description}</p>
                  ) : null}
                  {exercise.video ? (
                    <div className="mt-2">
                      <ExerciseVideoLink url={exercise.video} label={exercise.name} />
                    </div>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <button type="button" className="text-xs text-teal" onClick={() => load(exercise.id)}>
                    {tr("تعديل")}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs text-red-700"
                    disabled={busy}
                    onClick={() => setRemoving(exercise.id)}
                  >
                    <Trash2 size={14} />
                    {tr("حذف")}
                  </button>
                </div>
              </div>
              {exercise.media_id ? (
                <ExerciseVideo src={"/api/media/" + exercise.media_id} label={tr("فيديو ") + exercise.name} />
              ) : null}
            </article>
          ))
        ) : (
          <div className="empty">
            {tr("أضف أول تمرين لمكتبتك. تمارينك الخاصة تظهر في دليل التمارين وفي البحث مع وسم «خاص بك».")}
          </div>
        )}
      </section>

      <section className="card p-6">
        <div className="section-title">
          <h2>{current ? tr("تعديل التمرين") : tr("تمرين جديد")}</h2>
          {editing ? (
            <button type="button" className="text-xs text-teal" onClick={clear}>
              <Plus size={14} />
              {tr("إضافة جديد")}
            </button>
          ) : null}
        </div>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label>
            {tr("اسم التمرين")}
            <input
              className="field"
              required
              minLength={2}
              maxLength={140}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            {tr("تعليمات المدرب (يراها المتدرب)")}
            <textarea
              className="field min-h-24"
              maxLength={2000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={tr("مثال: ظهر مستقيم، نزول ببطء، ووقفة ثانية بالأسفل.")}
            />
          </label>
          <label>
            {tr("رابط فيديو (اختياري)")}
            <input
              className="field"
              type="url"
              inputMode="url"
              value={video}
              onChange={(event) => setVideo(event.target.value)}
              placeholder="https://"
            />
            <small className="text-muted">{tr("رابط يوتيوب يُعرض داخل البطاقة مع صورة مصغّرة.")}</small>
          </label>
          <div>
            <p className="mb-2 text-sm font-medium">{tr("أو ارفع مقطعك")}</p>
            {mediaId ? (
              <div>
                <ExerciseVideo src={"/api/media/" + mediaId} label={tr("الفيديو المرفوع")} />
                <button
                  type="button"
                  className="mt-2 inline-flex items-center gap-1 text-xs text-red-700"
                  onClick={() => setMediaId(null)}
                >
                  <X size={14} />
                  {tr("إزالة الفيديو المرفوع")}
                </button>
              </div>
            ) : (
              <VideoUpload onComplete={(id) => setMediaId(id)} />
            )}
          </div>
          <button className="btn w-full" disabled={busy || name.trim().length < 2}>
            {busy ? tr("جارٍ الحفظ…") : current ? tr("حفظ التعديل") : tr("إضافة إلى مكتبتي")}
          </button>
        </form>
        <Notice result={result} />
      </section>

      <ConfirmDialog
        open={Boolean(removing)}
        title={tr("حذف التمرين من مكتبتك؟")}
        confirmLabel="احذف"
        danger
        busy={busy}
        onConfirm={() => void remove(removing)}
        onClose={() => setRemoving("")}
      >
        {tr("البرامج المبنية منه ما تتأثر: كل برنامج يحتفظ بنسخته من الاسم والتعليمات والفيديو.")}
      </ConfirmDialog>
    </div>
  );
}
