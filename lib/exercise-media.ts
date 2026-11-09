import { catalogById } from "./catalog";

// Exact animated matches only. Never infer a visual from a muscle/name pattern.
export type ExerciseMedia = {
  provider: "MoveKit";
  slug: string;
  source: string;
  license: string;
  reviewed: string;
};
export const exerciseMedia: Record<string, ExerciseMedia> = {
  Pullups: {
    provider: "MoveKit",
    slug: "pull-ups",
    source: "https://movekit.com/free-sample",
    license: "https://movekit.com/license",
    reviewed: "2026-11-07",
  },
  Dumbbell_Flyes: {
    provider: "MoveKit",
    slug: "dumbbell-chest-fly",
    source: "https://movekit.com/free-sample",
    license: "https://movekit.com/license",
    reviewed: "2026-11-07",
  },
};

export function exerciseMediaUrl(
  id: string,
  kind: "poster" | "video",
  portalHash?: string,
) {
  if (!Object.hasOwn(exerciseMedia, id)) return undefined;
  const query = new URLSearchParams({ kind });
  if (portalHash) query.set("portal", portalHash);
  return `/api/exercise-media/${encodeURIComponent(id)}?${query}`;
}

/** Public-domain stills shipped with the catalog, keyed by the exact exercise ID. */
export function exerciseImageUrl(id: string) {
  if (!catalogById.has(id)) return undefined;
  return `/exercises/${encodeURIComponent(id)}.webp`;
}
