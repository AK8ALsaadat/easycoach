import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { preferredScrollBehavior } from "@/lib/scroll-behavior";
import { amountError, parseAmount } from "@/lib/macros";
import { DecimalInput } from "@/components/decimal-input";
import { exerciseIndex } from "@/lib/exercise-index";
import { exerciseName } from "@/lib/exercise-names";
import { catalog, exerciseName as pickerName } from "@/lib/catalog";
import { createTranslator } from "@/lib/translate";
import english from "@/lib/locales/en.json";

afterEach(() => vi.unstubAllGlobals());

it("formats Arabic without loading an English dictionary", () => {
  expect(createTranslator("ar")("عدد النتائج: {0}", "5")).toBe("عدد النتائج: 5");
});
it("preserves every English translation and its substitutions", () => {
  const tr = createTranslator("en", english);
  for (const [key, translated] of Object.entries(english)) {
    const expected = translated.replace(/\{(\d+)\}/g, (_, index) => `value-${index}`);
    expect(tr(key, ...Array.from({length: 10}, (_, index) => `value-${index}`))).toBe(expected);
  }
});
it("translates already substituted dynamic messages and preserves unknown text", () => {
  const tr = createTranslator("en", { "عدد النتائج: {0}": "Results: {0}" });
  expect(tr("عدد النتائج: 12")).toBe("Results: 12");
  expect(tr("untranslated")).toBe("untranslated");
  for (const text of ["constructor", "toString", "__proto__"]) expect(tr(text)).toBe(text);
});

it("uses instant scrolling when reduced motion is requested", () => {
  vi.stubGlobal("window", { matchMedia: () => ({ matches: true }) });
  expect(preferredScrollBehavior()).toBe("instant");
});
it("retains smooth scrolling when motion is allowed", () => {
  vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
  expect(preferredScrollBehavior()).toBe("smooth");
});

describe("numeric input integrity", () => {
  it.each([
    ["2,000", 2000], ["١٬٢٥٠٫٥", 1250.5], ["150,5", 150.5],
    ["۱۲۵٫۵", 125.5], ["−25", -25], ["0", 0],
  ])("parses %s without changing its meaning", (raw, value) => {
    expect(parseAmount(raw)).toBe(value);
  });
  it.each(["1..2", "12abc", "1٬25", "-", ".", "1,23,4"])("rejects malformed %s", raw => {
    expect(amountError(parseAmount(raw), 1000)).not.toBeNull();
  });
  it("associates the validation message with a field and preserves its hint", () => {
    const html = renderToStaticMarkup(createElement(DecimalInput, {
      id: "amount", value: -25, max: 1000, onValue() {}, "aria-describedby": "hint",
    }));
    expect(html).toContain('value="-25"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="hint amount-error"');
    expect(html).toContain('id="amount-error"');
  });
  it("shows an error when calculated read-only calories exceed the limit", () => {
    const html = renderToStaticMarkup(createElement(DecimalInput, {
      id: "calculated", value: 17000, max: 10000, readOnly: true, onValue() {},
    }));
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('id="calculated-error"');
  });
});

it("keeps all display-only exercise names aligned with the full picker in both languages", () => {
  expect(exerciseIndex.size).toBe(catalog.length);
  for (const exercise of catalog) {
    const entry = exerciseIndex.get(exercise.id);
    expect(entry).toEqual({ id: exercise.id, name: exercise.name });
    expect(exerciseName(entry!, "ar")).toBe(pickerName(exercise, "ar"));
    expect(exerciseName(entry!, "en")).toBe(pickerName(exercise, "en"));
  }
});
