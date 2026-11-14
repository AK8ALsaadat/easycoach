import { expect, it } from "vitest";
import { catalog, exerciseName } from "@/lib/catalog";
import arabic from "@/lib/exercise-data/ar.json";

const names = Object.values(arabic as Record<string, { name: string }>).map((entry) => entry.name);

/**
 * The Arabic names were machine-translated and produced nonsense a coach would
 * not show a client: «اضغط على مقاعد البدلاء» for Bench Press, «تجعيد الشعر»
 * for Curl, «نظيفة ورعشة» for Clean and Jerk. They are now composed from a
 * reviewed lexicon (scripts/build-arabic-exercise-names.mjs); this pins the
 * mistakes so they cannot come back.
 */
it("carries none of the machine-translation mistakes", () => {
  const wrong = [
    "مقاعد البدلاء", // bench read as a substitutes' bench
    "تجعيد", // curl read as hair curling
    "الصحافة", // press read as the press
    "رعشة", // jerk read as a shudder
    "خطف", // snatch read as abduction
    "العجول", // calves read as calves the animal
    "الضفيرة", // curl read as a braid
    "المقصلة", // guillotine press
    "شنق", // hang read as hanging
    "نظيفة", // clean read as the adjective
  ];
  for (const term of wrong) expect(names.filter((name) => name.includes(term))).toEqual([]);
});

it("uses one word for each movement across the whole guide", () => {
  // Squat is «سكوات» everywhere; «قرفصاء» appeared in 50 names before.
  expect(names.filter((name) => name.includes("قرفصاء"))).toEqual([]);
  expect(names.filter((name) => name.includes("سكوات")).length).toBeGreaterThan(30);
});

it("names the movements a coach actually programs", () => {
  const expected: Record<string, string> = {
    Barbell_Squat: "سكوات بالبار",
    Goblet_Squat: "سكوات جوبلت",
    Frankenstein_Squat: "سكوات فرانكشتاين",
    Dumbbell_Bench_Press: "ضغط بنش بالدمبل",
    Barbell_Deadlift: "ديدلفت بالبار",
    Romanian_Deadlift: "ديدلفت روماني",
    Clean_and_Jerk: "كلين آند جيرك",
    Smith_Machine_Squat: "سكوات بجهاز سميث",
  };
  for (const [id, name] of Object.entries(expected)) {
    const exercise = catalog.find((item) => item.id === id);
    expect(exercise, id).toBeTruthy();
    expect(exerciseName(exercise!, "ar"), id).toBe(name);
  }
});

it("never repeats a modifier in one name", () => {
  for (const name of names) {
    const words = name.split(" ").filter((word) => word.length > 3);
    expect(new Set(words).size, name).toBe(words.length);
  }
});

it("provides an Arabic name for every movement", () => {
  expect(names).toHaveLength(876);
  for (const name of names) expect(name).toMatch(/[\u0600-\u06ff]/);
});
