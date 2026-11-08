import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  previewFullImport,
  groupedMigrationRows,
  categories,
  parseImportDate,
  type SheetMapping,
  type MigrationRow,
} from "./full-import";
import type { Client } from "./model";
const sheet = z.object({
  name: z.string().max(100),
  headers: z.array(z.string().max(1000)).max(100),
  rows: z.array(z.array(z.string().max(32767)).max(100)).max(10000),
  rowNumbers: z.array(z.number().int().positive()).optional(),
});
const inputSchema = z.object({
  file: z.object({
    headers: sheet.shape.headers,
    rows: sheet.shape.rows,
    sheets: z.array(sheet).max(100).optional(),
  }),
  mappings: z
    .array(
      z.object({
        category: z.enum(
          Object.keys(categories) as [
            keyof typeof categories,
            ...Array<keyof typeof categories>,
          ],
        ),
        fields: z.record(z.string().max(100), z.number().int().min(-1).max(99)),
      }),
    )
    .max(100),
  mode: z.enum(["skip", "merge"]),
  partial: z.boolean(),
  ignore_unmapped: z.boolean(),
  date_order: z.enum(["DMY", "MDY"]),
});
function stable(value: unknown): string {
  if (value === undefined) return "null";
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  if (value !== null && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, v]) => JSON.stringify(key) + ":" + stable(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
const digest = (value: unknown) =>
  createHash("sha256").update(stable(value)).digest("hex");

export class ImportReviewError extends Error {
  constructor(
    message: string,
    public errors: MigrationRow[],
  ) {
    super(message);
  }
}
export function prepareImport(
  input: unknown,
  current: { clients: Pick<Client, "email" | "archived">[] },
) {
  const data = inputSchema.parse(input);
  if (Buffer.byteLength(JSON.stringify(data), "utf8") > 3_800_000)
    throw Error(
      "دفعة كبيرة؛ قسم الملف إلى دفعات أصغر من 3.8 ميجابايت بعد التحويل",
    );

  const preview = previewFullImport(
    data.file,
    data.mappings as SheetMapping[],
    current.clients.map((c) => c.email),
    data.date_order,
  );
  if (preview.length > 10000 || !preview.length)
    throw Error("اختر 1–10000 صف مدعوم");
  const duplicate = new Map<string, number>();
  for (const row of preview.filter((r) => r.category === "clients"))
    duplicate.set(row.email, (duplicate.get(row.email) ?? 0) + 1);
  for (const row of preview)
    if (row.category === "clients" && (duplicate.get(row.email) ?? 0) > 1)
      row.errors.push(
        "إيميل العميل مكرر في ورقة العملاء؛ اجمع بياناته في صف واحد",
      );
  const known = new Set([
    ...current.clients.filter((c) => !c.archived).map((c) => c.email),
    ...preview
      .filter((r) => r.category === "clients" && !r.errors.length)
      .map((r) => r.email),
  ]);
  for (const row of preview)
    if (
      !["clients", "templates"].includes(row.category) &&
      !known.has(row.email)
    )
      row.errors.push(
        "لا يوجد عميل نشط بهذا الإيميل في الحساب أو ورقة العملاء",
      );
  const errors = preview.filter((row) => row.errors.length);
  if (errors.length && !data.partial)
    throw new ImportReviewError(
      `يوجد ${errors.length} صف غير صالح؛ صححها أو اختر تجاوزها صراحة`,
      errors,
    );
  if (preview.some((row) => row.warnings.length) && !data.ignore_unmapped)
    throw Error("توجد أعمدة غير مربوطة؛ اربطها أو وافق على تجاهلها صراحة");
  const rows = groupedMigrationRows(preview).map((row) => {
    const values = { ...row.values };
    for (const key of ["start_date", "end_date", "date"])
      if (values[key]) {
        // Already parsed in preview for records; normalize financial dates as well.
        values[key] =
          key === "date" && row.data?.entry_date
            ? row.data.entry_date
            : parseImportDate(values[key], data.date_order);
      }
    const rowData = row.data
      ? Object.fromEntries(
          Object.entries(row.data).filter(([key]) => key !== "extra_rows"),
        )
      : undefined;
    if (row.category === "payments")
      values.method =
        (
          {
            "تحويل بنكي": "bank",
            تحويل: "bank",
            نقدي: "cash",
            أخرى: "other",
          } as Record<string, string>
        )[values.method] ??
        values.method ??
        "other";
    return {
      category: row.category,
      email: row.email,
      data: rowData,
      values,
      source_key:
        row.values.source_key ||
        digest(
          row.values.source_key
            ? {
                category: row.category,
                email: row.email,
                external: row.values.source_key,
              }
            : {
                category: row.category,
                email: row.email,
                data: rowData,
                values:
                  row.category === "subscriptions" ||
                  row.category === "payments"
                    ? values
                    : undefined,
              },
        ),
    };
  });
  if (!rows.length) throw Error("لا توجد صفوف صالحة للاستيراد");
  if (
    rows.length > 10000 ||
    Buffer.byteLength(JSON.stringify(rows), "utf8") > 3_700_000
  )
    throw Error(
      "البيانات بعد التحويل أكبر من حد الدفعة؛ قسّم الملف إلى دفعات أصغر لحفظ كل دفعة داخل معاملة واحدة",
    );

  return {
    payload: {
      id: randomUUID(),
      fingerprint: digest({ rows, mode: data.mode }),
      mode: data.mode,
      rows,
    },
    errors,
    unmapped: preview
      .filter((row) => row.warnings.length)
      .map((row) => ({
        sheet: row.sheet,
        row: row.row,
        warnings: row.warnings,
      })),
  };
}
