import type { Snapshot } from "./model";
import { effectiveNutrition } from "./management";

/**
 * The only data the service worker may keep offline: the trainee's latest
 * published program and effective nutrition plan. No weights, messages,
 * photos, payments, contact details or coach notes.
 */
export function offlinePlan(data: Snapshot, now = new Date()) {
  const linked = data.clients.filter((c) => c.trainee_user_id === data.profile?.id && !c.archived);
  return {
    generated_at: now.toISOString(),
    plans: linked.map((client) => {
      const program = data.programs
        .filter((p) => p.client_id === client.id && p.published_at)
        .sort((a, b) => b.published_at!.localeCompare(a.published_at!))[0];
      const nutrition = effectiveNutrition(data.management?.records ?? [], client.id, program?.published_at) ?? program?.content.nutrition;
      return {
        client_id: client.id,
        coach: data.coach_branding?.find((b) => b.coach_id === client.coach_id)?.name ?? null,
        program: program
          ? {
              name: program.name,
              published_at: program.published_at,
              days: program.content.days.map((day) => ({
                name: day.name,
                weekday: day.weekday,
                exercises: day.exercises.map(({ name, sets, reps, rest, weight, rpe, rir, tempo }) => ({ name, sets, reps, rest, weight, rpe, rir, tempo })),
              })),
            }
          : null,
        nutrition: nutrition
          ? {
              calories: nutrition.calories,
              protein: nutrition.protein,
              carbs: nutrition.carbs,
              fat: nutrition.fat,
              text: nutrition.text,
              meals: (nutrition.meals ?? []).map(({ name, time, foods, calories, protein, carbs, fat }) => ({ name, time, foods, calories, protein, carbs, fat })),
            }
          : null,
      };
    }),
  };
}
