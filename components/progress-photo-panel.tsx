"use client";
import { useLocale } from "./locale-provider";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ImagePlus, Maximize2, RotateCcw, Trash2, Upload, X } from "lucide-react";
import { photoTicket, finishPhoto, deleteProgressPhoto } from "@/app/photo-actions";
import { formatDate, riyadhToday } from "@/lib/dates";
import type { ManagementData } from "@/lib/management";
import type { CoachingRecord } from "@/lib/management";
import type { WeightEntry } from "@/lib/model";
import { prepareProgressPhoto } from "@/lib/prepare-progress-photo";

type Angle = "front" | "back" | "side";
type Slot = { file: File; preview: string; requestId: string };
const ANGLES: { key: Angle; label: string; hint: string }[] = [
  { key: "front", label: "أمام", hint: "قف بوضع مريح أمام الكاميرا." },
  { key: "back", label: "خلف", hint: "التقط الصورة من الخلف بوضع مريح." },
  { key: "side", label: "جانب", hint: "اختر الجانب نفسه في كل مرة للمقارنة." },
];
const labelFor = (angle: string, tr: (text: string) => string) =>
  tr(ANGLES.find((item) => item.key === angle)?.label ?? "زاوية غير محددة");

export function ProgressPhotos({
  clientId,
  photos,
  portalToken,
  portalHash,
  onUpdate,
  coach = false,
  measurements = [],
  weights = [],
}: {
  clientId: string;
  photos: ManagementData["progress_photos"];
  portalToken?: string;
  portalHash?: string;
  onUpdate?: () => Promise<unknown>;
  coach?: boolean;
  measurements?: CoachingRecord[];
  weights?: WeightEntry[];
}) {
  const { t: tr, language } = useLocale();
  const router = useRouter();
  const [slots, setSlots] = useState<Partial<Record<Angle, Slot>>>({});
  const slotsRef = useRef(slots);
  useEffect(() => {
    slotsRef.current = slots;
  }, [slots]);
  const [day, setDay] = useState(riyadhToday());
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState<Angle | null>(null);
  const [message, setMessage] = useState("");
  const [zoom, setZoom] = useState<string | null>(null);
  const [deleting, setDeleting] = useState("");
  const [compareAngle, setCompareAngle] = useState<Angle>("front");
  const [firstDate, setFirstDate] = useState<string | null>(null);
  const [secondDate, setSecondDate] = useState<string | null>(null);

  useEffect(
    () => () => Object.values(slotsRef.current).forEach((slot) => slot && URL.revokeObjectURL(slot.preview)),
    [],
  );

  const clientPhotos = useMemo(
    () => photos.filter((photo) => photo.client_id === clientId && photo.status === "ready"),
    [photos, clientId],
  );
  const comparisonDates = useMemo(
    () => [...new Set(clientPhotos.filter((photo) => photo.angle === compareAngle).map((photo) => photo.entry_date))].sort(),
    [clientPhotos, compareAngle],
  );
  const selectedFirstDate = firstDate ?? (comparisonDates.length > 1 ? comparisonDates.at(-2)! : comparisonDates[0] ?? "");
  const selectedSecondDate = secondDate ?? (comparisonDates.length > 1 ? comparisonDates.at(-1)! : "");
  const firstPhoto = clientPhotos
    .filter((photo) => photo.angle === compareAngle && photo.entry_date === selectedFirstDate)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const secondPhoto = clientPhotos
    .filter((photo) => photo.angle === compareAngle && photo.entry_date === selectedSecondDate)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const metricsFor = (date: string) => {
    if (!date) return null;
    const record = measurements
      .filter((item) => item.entry_date === date && !item.payload.historical_only)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    const weight = weights
      .filter((item) => item.entry_date === date)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
    const payload = record?.payload ?? {};
    return {
      weight: weight ? Number(weight.weight) : typeof payload.weight === "number" ? payload.weight : undefined,
      body_fat: typeof payload.body_fat === "number" ? payload.body_fat : undefined,
      waist: typeof payload.waist === "number" ? payload.waist : undefined,
      chest: typeof payload.chest === "number" ? payload.chest : undefined,
      hips: typeof payload.hips === "number" ? payload.hips : undefined,
      arm: typeof payload.arm === "number" ? payload.arm : undefined,
      thigh: typeof payload.thigh === "number" ? payload.thigh : undefined,
      calf: typeof payload.calf === "number" ? payload.calf : undefined,
    };
  };
  const firstMetrics = metricsFor(selectedFirstDate);
  const secondMetrics = metricsFor(selectedSecondDate);
  const photoTimeline = useMemo(() => {
    const grouped = new Map<string, typeof clientPhotos>();
    for (const photo of clientPhotos) {
      const datePhotos = grouped.get(photo.entry_date) ?? [];
      datePhotos.push(photo);
      grouped.set(photo.entry_date, datePhotos);
    }
    return [...grouped.entries()]
      .map(([date, datePhotos]) => ({ date, photos: datePhotos }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [clientPhotos]);
  const metricRows = [
    ["الوزن", "weight", "كجم"],
    ["نسبة الدهون", "body_fat", "%"],
    ["الخصر", "waist", "سم"],
    ["الصدر", "chest", "سم"],
    ["الحوض", "hips", "سم"],
    ["الذراع", "arm", "سم"],
    ["الفخذ", "thigh", "سم"],
    ["الساق", "calf", "سم"],
  ] as const;
  const photoUrl = (id: string) => `/api/progress-photos/${id}${portalHash ? `?portal=${portalHash}` : ""}`;

  function photoFigure(photo: ManagementData["progress_photos"][number], label: string, date: string) {
    return (
      <figure key={photo.id} className="overflow-hidden rounded-lg border border-line">
        <button
          type="button"
          className="progress-photo-timeline-image"
          onClick={() => setZoom(photoUrl(photo.id))}
          aria-label={tr("تكبير صورة ") + tr(label) + " " + formatDate(date, language)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoUrl(photo.id)} alt={`${tr(label)} · ${formatDate(date, language)}`} loading="lazy" />
        </button>
        <figcaption className="flex justify-end p-2">
          <button type="button" className="btn-soft" disabled={Boolean(deleting)} onClick={() => void removePhoto(photo)}>
            <Trash2 size={14} />{tr(deleting === photo.id ? "جارٍ الحذف…" : "حذف")}
          </button>
        </figcaption>
      </figure>
    );
  }

  async function removePhoto(photo: ManagementData["progress_photos"][number]) {
    if (!window.confirm(tr("حذف هذه الصورة نهائيًا؟"))) return;
    setDeleting(photo.id);
    setMessage("");
    try {
      const result = await deleteProgressPhoto(photo.id, portalToken);
      if (!result.ok) setMessage(result.error ?? "تعذر حذف الصورة.");
      else {
        setMessage("تم حذف الصورة من السجل.");
        if (onUpdate) await onUpdate();
        else router.refresh();
      }
    } catch {
      setMessage("تعذر الاتصال. لم نتأكد من حذف الصورة؛ حدّث السجل قبل المحاولة مرة أخرى.");
    } finally {
      setDeleting("");
    }
  }

  async function selectFile(angle: Angle, original?: File) {
    const previous = slots[angle];
    if (!original) {
      if (previous) URL.revokeObjectURL(previous.preview);
      setSlots((current) => {
        const next = { ...current };
        delete next[angle];
        return next;
      });
      return;
    }
    setPreparing(angle);
    setMessage("");
    try {
      const file = await prepareProgressPhoto(original);
      if (previous) URL.revokeObjectURL(previous.preview);
      setSlots((current) => ({
        ...current,
        [angle]: { file, preview: URL.createObjectURL(file), requestId: crypto.randomUUID() },
      }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر تجهيز الصورة.");
    } finally {
      setPreparing(null);
    }
  }

  async function upload() {
    if (!consent) {
      setMessage(coach ? "أكد حصولك على موافقة المتدرب قبل الرفع." : "أكد موافقتك قبل رفع الصور.");
      return;
    }
    const pending = ANGLES.flatMap(({ key }) => slots[key] ? [{ angle: key, slot: slots[key]! }] : []);
    if (!pending.length) {
      setMessage("اختر صورة واحدة على الأقل.");
      return;
    }
    setBusy(true);
    setMessage("");
    const failures: string[] = [];
    for (const { angle, slot } of pending) {
      try {
        const ticket = await photoTicket(
          {
            id: slot.requestId,
            client_id: clientId,
            entry_date: day,
            angle,
            consent_confirmed: true,
            filename: slot.file.name,
            size: slot.file.size,
            mime: slot.file.type,
          },
          portalToken,
        );
        if (!ticket.ok || !ticket.id || (!ticket.url && !ticket.alreadyReady))
          throw new Error(ticket.error ?? "تعذر تجهيز رفع الصورة.");
        if (!ticket.alreadyReady) {
          const response = await fetch(ticket.url!, {
            method: "PUT",
            headers: {
              "Content-Type": slot.file.type,
              ...(ticket.portalHash ? { "x-portal-hash": ticket.portalHash } : {}),
            },
            body: slot.file,
          });
          if (!response.ok) throw new Error("تعذر رفع الصورة. أعد المحاولة؛ ستبقى الصورة المختارة هنا.");
          const result = await finishPhoto(ticket.id, portalToken);
          if (!result.ok) throw new Error(result.error);
        }
        URL.revokeObjectURL(slot.preview);
        setSlots((current) => {
          const next = { ...current };
          delete next[angle];
          return next;
        });
      } catch (error) {
        failures.push(`${labelFor(angle, tr)}: ${error instanceof Error ? error.message : "تعذر الرفع"}`);
      }
    }
    if (failures.length) setMessage(failures.join(" · "));
    else {
      setMessage("تم حفظ الصور. يمكنك إضافة زاوية أخرى أو العودة لاحقًا.");
      setConsent(false);
      if (onUpdate) await onUpdate();
      else router.refresh();
    }
    if (failures.length && onUpdate) await onUpdate();
    setBusy(false);
  }

  return (
    <section className="card p-5 space-y-5">
      <div>
        <h2>{tr("صور التقدم")}</h2>
        <p className="mt-1 text-sm text-muted">
          {tr("رتب الصور بهذا التسلسل: أمام، خلف، جانب. اختر إضاءة ومسافة ثابتتين، وخذ وضعية مريحة بملابس تختارها.")}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          {tr("تاريخ الصور")}
          <input className="field" type="date" value={day} max={riyadhToday()} onChange={(event) => setDay(event.target.value)} />
        </label>
        <p className="self-end text-xs leading-6 text-muted">
          {tr("حافظ على الإضاءة والمسافة والوقفة نفسها قدر الإمكان. لا تحتاج إلى ملابس كاشفة.")}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {ANGLES.map(({ key, label, hint }) => {
          const slot = slots[key];
          return (
            <article key={key} className="rounded-xl border border-line p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold">{tr(label)}</h3>
                {slot && <button type="button" className="btn-soft" onClick={() => void selectFile(key)} aria-label={tr("إزالة صورة ") + tr(label)}><Trash2 size={15} />{tr("إزالة")}</button>}
              </div>
              <p className="mt-1 text-xs text-muted">{tr(hint)}</p>
              {slot ? (
                <div className="mt-3 overflow-hidden rounded-lg bg-canvas">
                  {/* Preview stays local until the trainee or coach submits the upload. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={slot.preview} alt={tr("معاينة زاوية ") + tr(label)} className="h-56 w-full object-contain" />
                  <div className="flex items-center justify-between gap-2 p-2 text-xs">
                    <span className="truncate">{slot.file.name}</span>
                    <button type="button" className="btn-soft" onClick={() => document.getElementById(`progress-photo-${clientId}-${key}`)?.click()}><RotateCcw size={14} />{tr("استبدال")}</button>
                  </div>
                </div>
              ) : (
                <label className="mt-3 flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line bg-canvas p-4 text-center text-sm">
                  <ImagePlus size={21} />
                  {tr(preparing === key ? "نجهز الصورة…" : "التقط صورة أو اختر من الجهاز")}
                  <input id={`progress-photo-${clientId}-${key}`} aria-label={tr(key === "front" ? "صورة تقدم خاصة" : "صورة ") + (key === "front" ? "" : tr(label))} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment" disabled={preparing === key || busy} onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void selectFile(key, file); }} />
                </label>
              )}
            </article>
          );
        })}
      </div>

      <label className="flex items-start gap-3 rounded-xl bg-canvas p-4 text-sm leading-7">
        <input type="checkbox" className="mt-1 size-4 accent-[var(--ui-primary)]" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
        <span>{tr(coach ? "أؤكد أن المتدرب وافق على رفع صور التقدم، وأن مدربه يستطيع رؤيتها." : "أوافق على رفع صور التقدم، وأفهم أن مدربي يستطيع رؤيتها.")}</span>
      </label>
      <button type="button" className="btn" onClick={() => void upload()} disabled={busy || preparing !== null}>
        <Upload size={17} /> {busy ? tr("جارٍ رفع الصور…") : tr(Object.keys(slots).length === 1 ? "رفع صورة" : "رفع الصور المختارة")}
      </button>
      {message && <p role="status" className="text-sm">{tr(message)}</p>}

      <section className="border-t pt-5">
        <h3 className="font-semibold">{tr("مقارنة صورتين")}</h3>
        <p className="mt-1 text-xs text-muted">{tr("اختر التاريخين والزاوية نفسها. الصور تحافظ على أبعادها؛ افتح أي صورة لعرضها بحجم أكبر.")}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label>{tr("الزاوية")}
            <select className="field" value={compareAngle} onChange={(event) => { setCompareAngle(event.target.value as Angle); setFirstDate(null); setSecondDate(null); }}>
              {ANGLES.map(({ key, label }) => <option key={key} value={key}>{tr(label)}</option>)}
            </select>
          </label>
          <label>{tr("التاريخ الأول")}
            <select className="field" value={selectedFirstDate} onChange={(event) => { setFirstDate(event.target.value); if (event.target.value === selectedSecondDate) setSecondDate(""); }}>
              <option value="">{tr("اختر تاريخًا")}</option>
              {comparisonDates.filter((date) => date !== selectedSecondDate).map((date) => <option value={date} key={date}>{formatDate(date, language)}</option>)}
            </select>
          </label>
          <label>{tr("التاريخ الثاني")}
            <select className="field" value={selectedSecondDate} onChange={(event) => { setSecondDate(event.target.value); if (event.target.value === selectedFirstDate) setFirstDate(""); }}>
              <option value="">{tr("اختر تاريخًا")}</option>
              {comparisonDates.filter((date) => date !== selectedFirstDate).map((date) => <option value={date} key={date}>{formatDate(date, language)}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {[{ photo: firstPhoto, date: selectedFirstDate, label: "التاريخ الأول" }, { photo: secondPhoto, date: selectedSecondDate, label: "التاريخ الثاني" }].map(({ photo, date, label }) => (
            <figure className="overflow-hidden rounded-xl border border-line" key={label}>
              <figcaption className="flex items-center justify-between gap-3 px-3 py-2 text-sm"><strong>{tr(label)}</strong><span>{date || tr("لم يُحدد")}</span></figcaption>
              {photo ? <button type="button" className="block w-full bg-canvas" onClick={() => setZoom(photoUrl(photo.id))} aria-label={tr("تكبير صورة ") + tr(label)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoUrl(photo.id)} alt={`${tr(label)}، ${tr(labelFor(compareAngle, tr))}`} loading="lazy" className="h-72 w-full object-contain" />
                <span className="flex items-center justify-center gap-2 p-2 text-xs text-muted"><Maximize2 size={14} />{tr("عرض مكبر")}</span>
              </button> : <div className="grid h-72 place-items-center bg-canvas p-4 text-center text-sm text-muted">{tr(date ? "لا توجد صورة بهذه الزاوية في هذا التاريخ." : "اختر تاريخين لعرض المقارنة.")}</div>}
            </figure>
          ))}
        </div>
        <div className="mt-4 overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead><tr><th>{tr("المؤشر")}</th><th>{selectedFirstDate ? formatDate(selectedFirstDate, language) : tr("التاريخ الأول")}</th><th>{selectedSecondDate ? formatDate(selectedSecondDate, language) : tr("التاريخ الثاني")}</th><th>{tr("التغير")}</th></tr></thead>
            <tbody>{metricRows.map(([label, key, unit]) => {
              const before = firstMetrics?.[key];
              const after = secondMetrics?.[key];
              return <tr key={key}><th scope="row" className="text-start">{tr(label)} ({unit === "%" ? unit : tr(unit)})</th><td>{before === undefined ? "—" : `${before} ${unit === "%" ? unit : tr(unit)}`}</td><td>{after === undefined ? "—" : `${after} ${unit === "%" ? unit : tr(unit)}`}</td><td dir="ltr">{before === undefined || after === undefined ? "—" : `${(after - before).toFixed(1)} ${unit === "%" ? unit : tr(unit)}`}</td></tr>;
            })}</tbody>
          </table>
          <p className="px-3 pb-3 text-xs text-muted">{tr("لا تُظهر المقارنة قيمة عند غياب القياس في أحد التاريخين.")}</p>
        </div>
      </section>

      <section className="border-t pt-5" aria-labelledby="progress-photo-timeline-title">
        <div className="section-title">
          <div><h3 id="progress-photo-timeline-title" className="font-semibold">{tr("الخط الزمني لصور التقدم")}</h3><p className="mt-1 text-xs text-muted">{tr("الصور مرتبة من الأحدث إلى الأقدم، ومجموعة حسب تاريخ التصوير.")}</p></div>
          {clientPhotos.length > 0 && <span className="badge">{tr("عدد الصور")}: {clientPhotos.length}</span>}
        </div>
        {!photoTimeline.length ? <p className="mt-4 text-sm text-muted">{tr("لا توجد صور تقدم محفوظة بعد.")}</p> : (
          <ol className="progress-photo-timeline">
            {photoTimeline.map(({ date, photos: datePhotos }) => (
              <li className="progress-photo-timeline-item" key={date}>
                <div className="progress-photo-timeline-marker" aria-hidden="true"><Check size={13} /></div>
                <article className="progress-photo-day-card">
                  <header className="progress-photo-day-header"><div><h4>{formatDate(date, language)}</h4><p>{tr("عدد الصور")}: {datePhotos.length}</p></div></header>
                  <div className="progress-photo-day-grid">
                    {ANGLES.map(({ key, label }) => {
                      const rows = datePhotos.filter((photo) => photo.angle === key).sort((a, b) => b.created_at.localeCompare(a.created_at));
                      const photo = rows[0];
                      return <section className={`progress-photo-angle-card ${photo ? "has-photo" : "is-missing"}`} key={key}>
                        <h5>{tr(label)}</h5>
                        {photo ? <>
                          <button type="button" className="progress-photo-timeline-image" onClick={() => setZoom(photoUrl(photo.id))} aria-label={tr("تكبير صورة ") + tr(label) + " " + formatDate(date, language)}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={photoUrl(photo.id)} alt={`${tr(label)} · ${formatDate(date, language)}`} loading="lazy" />
                          </button>
                          <div className="progress-photo-angle-actions">
                            <button type="button" className="btn-soft" disabled={Boolean(deleting)} onClick={() => void removePhoto(photo)}><Trash2 size={14} />{tr(deleting === photo.id ? "جارٍ الحذف…" : "حذف")}</button>
                          </div>
                          {rows.length > 1 && <details className="progress-photo-extra"><summary>{tr("صور إضافية ({0})", String(rows.length - 1))}</summary><div className="grid gap-2 pt-2">{rows.slice(1).map((extra) => photoFigure(extra, label, date))}</div></details>}
                        </> : <p className="progress-photo-missing-note">{tr("لم تُرفع هذه الزاوية في هذا التاريخ.")}</p>}
                      </section>;
                    })}
                  </div>
                  {datePhotos.some((photo) => photo.angle === "unspecified") && <details className="progress-photo-legacy"><summary>{tr("صور قديمة بدون زاوية محددة")}</summary><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{datePhotos.filter((photo) => photo.angle === "unspecified").map((photo) => photoFigure(photo, "زاوية غير محددة", date))}</div></details>}
                </article>
              </li>
            ))}
          </ol>
        )}
      </section>

      {zoom && <div className="fixed inset-0 z-50 grid place-items-center bg-black/90 p-3" role="dialog" aria-modal="true" aria-label={tr("عرض صورة التقدم")} onClick={() => setZoom(null)}>
        <button type="button" className="absolute end-4 top-4 rounded-full bg-white/15 p-3 text-white" aria-label={tr("إغلاق")} onClick={() => setZoom(null)}><X size={22} /></button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={zoom} alt={tr("صورة تقدم محفوظة") + " · " + labelFor(compareAngle, tr)} className="max-h-[92dvh] max-w-[96vw] object-contain" onClick={(event) => event.stopPropagation()} />
      </div>}
    </section>
  );
}
