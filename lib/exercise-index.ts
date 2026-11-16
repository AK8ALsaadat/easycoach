import names from "./exercise-data/names.json";
import type { ExerciseIdentity } from "./exercise-names";

/** Only names and IDs; the full picker data loads when the picker opens. */
export const exerciseIndex = new Map<string, ExerciseIdentity>(
  Object.entries(names).map(([id, name]) => [id, { id, name }]),
);
