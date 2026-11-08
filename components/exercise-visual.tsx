"use client";
import { useLocale } from "./locale-provider";
import { useState } from "react";
import { ImageOff, Play } from "lucide-react";
import { exerciseMedia, exerciseMediaUrl } from "@/lib/exercise-media";
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
  const { t: tr, language: locale } = useLocale();

  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const asset = Object.hasOwn(exerciseMedia, exercise.id)
    ? exerciseMedia[exercise.id]
    : undefined;
  const poster = exerciseMediaUrl(exercise.id, "poster", portalHash);
  const available = asset && !failed;
  return (
    <div
      className={`exercise-visual-frame ${available ? "visual-available" : "visual-unavailable"} ${className}`}
      data-exercise-id={exercise.id}
      data-media-status={available ? "verified" : "unavailable"}
    >
      {available ? (
        playing ? (
          <video
            controls
            autoPlay
            playsInline
            loop
            controlsList="nodownload"
            preload="metadata"
            poster={poster}
            src={exerciseMediaUrl(exercise.id, "video", portalHash)}
            onError={() => setFailed(true)}
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
              ref={(image) => {
                if (image?.complete && image.naturalWidth === 0)
                  setFailed(true);
              }}
              src={poster}
              alt={tr(
                "مجسم تشريحي يوضح {0} والعضلات المستهدفة",
                String(exerciseName(exercise, locale)),
              )}
              loading="lazy"
              width={960}
              height={536}
              onError={() => setFailed(true)}
            />
            {playable && (
              <button
                type="button"
                className="exercise-play"
                onClick={() => setPlaying(true)}
              >
                <Play size={18} />
                {tr("شاهد أداء الحركة")}
              </button>
            )}
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
          <small>{tr("راجع شرح الحركة أو فيديو مدربك")}</small>
        </div>
      )}
    </div>
  );
}
