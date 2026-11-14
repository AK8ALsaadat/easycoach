"use client";
import { useRef, useState } from "react";
import { Maximize2, Play } from "lucide-react";
import { useLocale } from "./locale-provider";
import { embeddedVideo, formatDuration } from "@/lib/video-links";

/**
 * Plays an exercise clip at the shape it was filmed in.
 *
 * Coaches film on their phones, so most clips are portrait. A fixed 16:9 box
 * pillarboxed them into two black bars with a tiny picture in the middle, and
 * `preload="none"` meant no first frame and a 0:00 duration until play. The
 * ratio now comes from the file's own metadata, and the duration is read from
 * the same metadata event.
 */
export function ExerciseVideo({
  src,
  label,
  className = "",
}: {
  src: string;
  label: string;
  className?: string;
}) {
  const { t: tr } = useLocale();
  const video = useRef<HTMLVideoElement>(null);
  const [ratio, setRatio] = useState<number | null>(null);
  const [duration, setDuration] = useState("");
  const portrait = ratio !== null && ratio < 1;
  return (
    <figure className={`exercise-video ${portrait ? "is-portrait" : ""} ${className}`}>
      <video
        ref={video}
        controls
        playsInline
        controlsList="nodownload"
        // Enough to paint a first frame and know the length, without pulling
        // the whole file on a phone connection.
        preload="metadata"
        className="exercise-video-media"
        style={ratio ? { aspectRatio: String(ratio) } : undefined}
        // Nudges Safari and Chrome into painting a frame as the poster.
        src={`${src}${src.includes("#") ? "" : "#t=0.1"}`}
        aria-label={label}
        onLoadedMetadata={(event) => {
          const element = event.currentTarget;
          if (element.videoWidth && element.videoHeight) setRatio(element.videoWidth / element.videoHeight);
          setDuration(formatDuration(element.duration));
        }}
      />
      <figcaption className="exercise-video-bar">
        {duration ? (
          <span className="exercise-video-duration">
            <bdi dir="ltr">{duration}</bdi>
          </span>
        ) : (
          <span className="exercise-video-duration text-muted">{tr("نقرأ مدة الفيديو…")}</span>
        )}
        <button
          type="button"
          className="btn-soft"
          onClick={() => void video.current?.requestFullscreen?.().catch(() => {})}
          aria-label={tr("عرض بكامل الشاشة")}
        >
          <Maximize2 size={14} />
          {tr("ملء الشاشة")}
        </button>
      </figcaption>
    </figure>
  );
}

/**
 * A pasted link. YouTube becomes a click-to-play embed with its own thumbnail;
 * anything else stays an ordinary link rather than a bare "Video link" label.
 */
export function ExerciseVideoLink({ url, label }: { url: string; label: string }) {
  const { t: tr } = useLocale();
  const [playing, setPlaying] = useState(false);
  const embed = embeddedVideo(url);
  if (!embed)
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="btn-secondary">
        <Play size={14} />
        {tr("فتح فيديو التمرين")}
      </a>
    );
  if (!playing)
    return (
      <button type="button" className="exercise-video-embed" onClick={() => setPlaying(true)} aria-label={tr("تشغيل ") + label}>
        {/* Remote thumbnail: outside the Next image optimizer on purpose. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={embed.thumbnail} alt="" loading="lazy" />
        <span className="exercise-video-play">
          <Play size={22} />
        </span>
        <small>{tr("فيديو من يوتيوب · اضغط للتشغيل")}</small>
      </button>
    );
  return (
    <div className="exercise-video is-embed">
      <iframe
        className="exercise-video-media"
        src={`${embed.embed}${embed.embed.includes("?") ? "&" : "?"}autoplay=1&rel=0`}
        title={label}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
      />
    </div>
  );
}
