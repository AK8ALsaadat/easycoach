"use client";
import { useLocale } from "./locale-provider";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { photoTicket, finishPhoto } from "@/app/photo-actions";
import { riyadhToday } from "@/lib/dates";
import type { ManagementData } from "@/lib/management";

export function ProgressPhotos({
  clientId,
  photos,
  portalToken,
  portalHash,
  onUpdate,
}: {
  clientId: string;
  photos: ManagementData["progress_photos"];
  portalToken?: string;
  portalHash?: string;
  onUpdate?: () => Promise<unknown>;
}) {
  const { t: tr } = useLocale();

  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <section className="card p-5">
      <h2>{tr("صور التقدم الخاصة")}</h2>
      <p className="text-sm text-muted mt-1">
        {tr(
          "JPG / PNG / WebP حتى 10MB. الصور متاحة للمدرب والعميل المرتبط فقط.",
        )}
      </p>
      <form
        className="grid gap-3 mt-4 sm:grid-cols-[1fr_1fr_auto]"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget,
            values = new FormData(form),
            file = values.get("photo");
          if (!(file instanceof File)) return;
          setBusy(true);
          setMessage("");
          try {
            const ticket = await photoTicket(
              {
                client_id: clientId,
                entry_date: values.get("day"),
                filename: file.name,
                size: file.size,
                mime: file.type,
              },
              portalToken,
            );
            if (!ticket.ok || !ticket.id || !ticket.url)
              throw Error(ticket.error ?? "تعذر تجهيز الرفع");
            const response = await fetch(ticket.url, {
              method: "PUT",
              headers: {
                "Content-Type": file.type,
                ...(ticket.portalHash
                  ? { "x-portal-hash": ticket.portalHash }
                  : {}),
              },
              body: file,
            });
            if (!response.ok) throw Error("تعذر رفع الصورة");
            const result = await finishPhoto(ticket.id, portalToken);
            if (!result.ok) throw Error(result.error);
            setMessage("تم حفظ الصورة الخاصة");
            form.reset();
            if (onUpdate) await onUpdate();
            else router.refresh();
          } catch (error) {
            setMessage(
              error instanceof Error ? error.message : "تعذر رفع الصورة",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          {tr("تاريخ الصورة")}
          <input
            className="field"
            type="date"
            name="day"
            defaultValue={riyadhToday()}
            max={riyadhToday()}
            required
          />
        </label>
        <label>
          {tr("الصورة")}
          <input
            aria-label={tr("صورة تقدم خاصة")}
            className="field"
            type="file"
            name="photo"
            accept="image/jpeg,image/png,image/webp"
            required
          />
        </label>
        <button className="btn-secondary self-end" disabled={busy}>
          <Upload size={17} />
          {busy ? tr("نرفع الصورة…") : tr("رفع صورة")}
        </button>
      </form>
      {message && (
        <p role="status" className="text-sm mt-3">
          {message}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 mt-5 sm:grid-cols-3">
        {photos
          .filter((photo) => photo.client_id === clientId)
          .sort((a, b) => b.entry_date.localeCompare(a.entry_date))
          .map((photo) => (
            <figure
              key={photo.id}
              className="border rounded-lg overflow-hidden"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/progress-photos/${photo.id}${portalHash ? "?portal=" + portalHash : ""}`}
                alt={tr("صورة تقدم بتاريخ ") + photo.entry_date}
                loading="lazy"
                className="w-full h-52 object-contain bg-canvas"
              />
              <figcaption className="p-2 text-sm">
                {photo.entry_date}
              </figcaption>
            </figure>
          ))}
      </div>
      {!photos.some((photo) => photo.client_id === clientId) && (
        <p className="mt-4 text-sm text-muted">
          {tr("لم تُرفع صور تقدم بعد.")}
        </p>
      )}
    </section>
  );
}
