import { clientInput } from "./model";
export type ImportFile = { headers: string[]; rows: string[][] };
export type Mapping = { name: number; email: number; phone: number };
export type PreviewRow = {
  row: number;
  data: { name: string; email: string; phone: string };
  errors: string[];
  existing: boolean;
};
export function previewImport(
  file: ImportFile,
  mapping: Mapping,
  existingEmails: string[],
): PreviewRow[] {
  const used = new Set(existingEmails.map((v) => v.trim().toLowerCase()));
  const counts = new Map<string, number>();
  const rows = file.rows.map((r, index) => {
    const rawPhone = (r[mapping.phone] ?? "").replace(/[\s()\-]/g, "");
    const phone = /^5\d{8}$/.test(rawPhone) ? "0" + rawPhone : rawPhone;
    const data = {
      name: (r[mapping.name] ?? "").trim(),
      email: (r[mapping.email] ?? "").trim().toLowerCase(),
      phone,
    };
    counts.set(data.email, (counts.get(data.email) ?? 0) + 1);
    const checked = clientInput.omit({ id: true }).safeParse(data);
    const errors: string[] = checked.success
      ? []
      : checked.error.issues.map((i) =>
          i.path[0] === "name"
            ? "الاسم مطلوب (حرفان على الأقل)"
            : i.path[0] === "email"
              ? "الإيميل غير صالح"
              : "رقم الجوال غير صالح",
        );
    if (Object.values(data).some((v) => /^\s*[=@]/.test(v)))
      errors.push("قيمة تشبه صيغة حسابية");
    return { row: index + 2, data, errors, existing: used.has(data.email) };
  });
  return rows.map((row) => ({
    ...row,
    errors: [
      ...row.errors,
      ...((counts.get(row.data.email) ?? 0) > 1
        ? ["الإيميل مكرر داخل الملف"]
        : []),
    ],
  }));
}
export function csvCell(value: unknown) {
  let s = String(value ?? "");
  if (/^\s*[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
