"use client";
import type { ComponentProps } from "react";
import { ExerciseCatalog } from "./exercise-picker";
import { useLocale } from "./locale-provider";
import { exerciseName, isCustomExercise } from "@/lib/catalog";
import { blankContent, type Content } from "@/lib/model";
export { ExerciseCatalog };

// Keep catalog lookups inside the deferred catalog chunk, outside Workspace.
export function TemplateExerciseCatalog({ onCreate, ...props }: Omit<ComponentProps<typeof ExerciseCatalog>, "onConfirm"> & { onCreate: (content: Content, name: string) => void }) {
  const { language } = useLocale();
  return <ExerciseCatalog {...props} onConfirm={exercises => {
    const seed = structuredClone(blankContent);
    seed.days[0].exercises = exercises.map(exercise => isCustomExercise(exercise)
      ? { name: exercise.name, description: exercise.custom.description, video: exercise.custom.video, ...(exercise.custom.mediaId ? { mediaId: exercise.custom.mediaId } : {}), sets: 3, reps: "10–12", rest: 90 }
      : { name: exerciseName(exercise, language), catalogId: exercise.id, description: "", video: "", sets: 3, reps: "10–12", rest: 90 });
    const first = exercises[0];
    if (!first) return;
    onCreate(seed, ("برنامج " + (isCustomExercise(first) ? first.name : exerciseName(first, language))).slice(0, 60).trim());
  }} />;
}
