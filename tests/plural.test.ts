import { expect, it } from "vitest";
import { countLabel, daysLeft, formatNumber, formatSar, formatSigned, lastEntries, nouns } from "@/lib/plural";
import { dayName, displayDayName } from "@/lib/program-builder";
import { traineeTerms } from "@/lib/terms";
import { auditLabel } from "@/lib/audit-labels";

it("fixes the reported Arabic plural mistakes", () => {
  expect(daysLeft("ar", 1)).toBe("متبقي يوم واحد"); // was "متبقي 1 يوم"
  expect(daysLeft("ar", 2)).toBe("متبقي يومان");
  expect(daysLeft("ar", 5)).toBe("متبقي 5 أيام");
  expect(daysLeft("ar", 14)).toBe("متبقي 14 يومًا");
  expect(daysLeft("ar", 0)).toBe("ينتهي اليوم");
  expect(lastEntries("ar", 1)).toBe("آخر تسجيل"); // was "آخر 1 تسجيلات"
  expect(lastEntries("ar", 2)).toBe("آخر تسجيلين");
  expect(lastEntries("ar", 7)).toBe("آخر 7 تسجيلات");
  expect(countLabel("ar", 1, nouns.movement)).toBe("حركة واحدة"); // was "1 حركات"
  expect(countLabel("ar", 0, nouns.round)).toBe("بدون جولات"); // was "0 جولة"
  expect(countLabel("ar", 9, nouns.round)).toBe("9 جولات"); // was "9 جولة"
  expect(countLabel("ar", 12, nouns.round)).toBe("12 جولة");
  expect(countLabel("ar", 1, nouns.exercise)).toBe("تمرين واحد");
  expect(countLabel("ar", 3, nouns.exercise)).toBe("3 تمارين");
  expect(countLabel("ar", 11, nouns.exercise)).toBe("11 تمرينًا");
});

it("matches gender and adjectives", () => {
  expect(countLabel("ar", 1, nouns.activeSubscription)).toBe("اشتراك نشط واحد");
  expect(countLabel("ar", 2, nouns.activeSubscription)).toBe("اشتراكان نشطان");
  expect(countLabel("ar", 4, nouns.activeSubscription)).toBe("4 اشتراكات نشطة");
  expect(countLabel("ar", 2, nouns.meal)).toBe("وجبتان");
  expect(countLabel("ar", 3, nouns.trainingDay)).toBe("3 أيام تدريبية");
  expect(countLabel("en", 1, nouns.movement)).toBe("1 movement");
  expect(countLabel("en", 3, nouns.round)).toBe("3 rounds");
});

it("formats numbers without leading zeros or needless decimals", () => {
  expect(formatNumber(2000)).toBe("2,000");
  expect(formatNumber(2000.0)).toBe("2,000");
  expect(formatNumber(79.54)).toBe("79.5");
  expect(formatSigned(-0.5)).toBe("-0.5");
  expect(formatSigned(1.25)).toBe("+1.3");
  expect(formatSigned(0)).toBe("0");
  expect(formatSar(650)).toBe("650 ر.س");
  expect(formatSar(1250.5, "en")).toBe("SAR 1,250.5");
});

it("uses ordinal day names", () => {
  expect(dayName(0)).toBe("اليوم الأول");
  expect(dayName(3)).toBe("اليوم الرابع");
  expect(displayDayName("اليوم 2")).toBe("اليوم الثاني");
  expect(displayDayName("Day 3", "ar")).toBe("اليوم الثالث");
  expect(displayDayName("يوم الصدر")).toBe("يوم الصدر");
});

it("says trainee instead of client and reads the change log", () => {
  expect(traineeTerms("العميل غير متاح")).toBe("المتدرب غير متاح");
  expect(traineeTerms("تصدير خاص بعملائك")).toBe("تصدير خاص بمتدربيك");
  expect(auditLabel("weight_entries:DELETE")).toBe("حذف قياس وزن");
  expect(auditLabel("clients:INSERT")).toBe("إضافة متدرب");
  expect(auditLabel("أرشفة متدرب")).toBe("أرشفة متدرب");
});
