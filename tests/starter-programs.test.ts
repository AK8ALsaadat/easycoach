import { expect, it } from "vitest";
import { content } from "@/lib/model";
import { starterContent, starterPrograms } from "@/lib/starter-programs";

it("produces valid independent editable programs with unique exercise rows", () => {
  for (const starter of starterPrograms) {
    const a = starterContent(starter.key), b = starterContent(starter.key);
    expect(content.safeParse(a).success).toBe(true);
    const ids = [...a.days, ...b.days].flatMap(day => day.exercises.map(row => row.rowId));
    expect(new Set(ids).size).toBe(ids.length);
    a.days[0].exercises[0].name = "تعديل المدرب";
    expect(b.days[0].exercises[0].name).not.toBe("تعديل المدرب");
  }
  expect(() => starterContent("missing")).toThrow();
});
