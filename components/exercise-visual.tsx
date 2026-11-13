"use client";
import { useLocale } from "./locale-provider";
import { useState } from "react";
import { ImageOff, Maximize2, Play } from "lucide-react";
import { Modal } from "./modal";
import {
  exerciseImageUrl,
  exerciseMedia,
  exerciseMediaUrl,
} from "@/lib/exercise-media";
import { exerciseName, type CatalogExercise } from "@/lib/catalog";

export function ExerciseVisual({
  exercise,
  className = "",
  playable = false,
  portalHash,
}: {
  exercise: CatalogExercise;
  className?: string;
  playable?: boolean;
  portalHash?: string;
}) {
  return <ExerciseVisualContent key={`${exercise.id}:${portalHash ?? ""}`} exercise={exercise} className={className} playable={playable} portalHash={portalHash} />;
}

function ExerciseVisualContent({ exercise, className, playable, portalHash }: {
  exercise: CatalogExercise; className: string; playable: boolean; portalHash?: string;
}) {
  const { t: tr, language: locale } = useLocale();

  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const asset = Object.hasOwn(exerciseMedia, exercise.id)
    ? exerciseMedia[exercise.id]
    : undefined;
  const poster = exerciseImageUrl(exercise.id);
  const available = Boolean(poster) && !failed;
  return (
    <div
      className={`exercise-visual-frame ${available ? "visual-available" : "visual-unavailable"} ${className}`}
      data-exercise-id={exercise.id}
      data-media-status={available ? "reviewed-photo" : "unavailable"}
    >
      {available ? (
        playing && asset ? (
          <video
            controls
            autoPlay
            playsInline
            loop
            controlsList="nodownload"
            preload="metadata"
            poster={poster}
            src={exerciseMediaUrl(exercise.id, "video", portalHash)}
            onError={() => { setPlaying(false); setVideoFailed(true); }}
            aria-label={tr(
              "عرض أداء {0}",
              String(exerciseName(exercise, locale)),
            )}
          />
        ) : (
          <>
            {/* Authenticated private media cannot go through the public Next image optimizer. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={retry}
              ref={(image) => {
                if (image?.complete && image.naturalWidth === 0)
                  setFailed(true);
              }}
              src={poster}
              alt={tr(
                "صورة توضح أداء {0}",
                String(exerciseName(exercise, locale)),
              )}
              loading="lazy"
              decoding="async"
              width={960}
              height={536}
              onError={() => setFailed(true)}
            />
            {playable && (
              <button type="button" className="exercise-zoom" aria-label={tr("تكبير صورة {0}", String(exerciseName(exercise, locale)))} onClick={() => setZoomed(true)}>
                <Maximize2 size={16} aria-hidden="true" />
              </button>
            )}
            {playable && asset && (
              <button
                type="button"
                className="exercise-play"
                onClick={() => { setVideoFailed(false); setPlaying(true); }}
              >
                <Play size={18} />
                {videoFailed ? tr("إعادة تشغيل الفيديو") : tr("شاهد أداء الحركة")}
              </button>
            )}
            {videoFailed && <span className="exercise-media-error" role="status">{tr("تعذر تشغيل الفيديو؛ يمكنك إعادة المحاولة.")}</span>}
          </>
        )
      ) : (
        <div className="exercise-placeholder" role="status">
          <ImageOff size={26} strokeWidth={1.5} aria-hidden="true" />
          <span>
            {failed
              ? tr("تعذر تحميل العرض التوضيحي")
              : tr("الصورة التوضيحية غير متاحة")}
          </span>
          {failed && playable && <button type="button" className="btn-secondary" onClick={() => { setFailed(false); setRetry(retry + 1); }}>{tr("إعادة تحميل الصورة")}</button>}
        </div>
      )}
      {playable && available && (
        <Modal open={zoomed} onClose={() => setZoomed(false)} title={exerciseName(exercise, locale)} className="max-w-3xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={poster} alt={tr("صورة توضح أداء {0}", String(exerciseName(exercise, locale)))} className="max-h-[75dvh] w-full rounded-lg object-contain" />
        </Modal>
      )}
    </div>
  );
}
