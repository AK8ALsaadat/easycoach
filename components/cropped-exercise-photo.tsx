"use client";
import type { ComponentPropsWithRef } from "react";
import data from "@/lib/exercise-data/photo-crops.json";
type Crop = { left: number; top: number; width: number; height: number; originalWidth: number; originalHeight: number };
export const photoCrops: Record<string, Crop> = data;
export function CroppedExercisePhoto({ exerciseId, alt, ...props }: ComponentPropsWithRef<"img"> & { exerciseId: string }) {
  const crop = photoCrops[exerciseId];
  return <span className="exercise-photo-crop" style={{ aspectRatio: crop ? `${crop.width}/${crop.height}` : "2/1" }}>
    {/* Source bytes are unchanged; only measured white borders are outside the viewport. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img {...props} alt={alt} style={crop ? { position: "absolute", maxWidth: "none", left: `${-crop.left / crop.width * 100}%`, top: `${-crop.top / crop.height * 100}%`, width: `${crop.originalWidth / crop.width * 100}%`, height: `${crop.originalHeight / crop.height * 100}%` } : { width: "100%", height: "auto" }}/>
  </span>;
}
