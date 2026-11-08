"use client";
import Link from "next/link";
import { useLocale } from "./locale-provider";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileSpreadsheet, Upload, RotateCcw } from "lucide-react";
import { applyFullImport } from "@/app/import-actions";
import { manage } from "@/app/management-actions";
import type { Result } from "@/app/actions";
import {
  autoMapping,
  categories,
  fieldLabels,
  previewFullImport,
  workbookSheets,
  type Category,
  type SheetMapping,
} from "@/lib/full-import";
import { csvCell, type ImportFile } from "@/lib/import-preview";
import type { ManagementData } from "@/lib/management";
import { Notice } from "./forms";

function download(name: string, body: string, mime: string) {
  const url = URL.createObjectURL(new Blob([body], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
export function ImportClients({
  emails,
  batches = [],
}: {
  emails: string[];
  batches?: ManagementData["import_batches"];
}) {
  const { t: tr } = useLocale();

  const router = useRouter();
  const [file, setFile] = useState<ImportFile | null>(null),
    [mappings, setMappings] = useState<SheetMapping[]>([]),
    [sheetIndex, setSheetIndex] = useState(0),
    [mode, setMode] = useState<"skip" | "merge">("skip"),
    [partial, setPartial] = useState(false),
    [ignoreUnmapped, setIgnoreUnmapped] = useState(false),
    [dateOrder, setDateOrder] = useState<"DMY" | "MDY">("DMY"),
    [page, setPage] = useState(0),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<Result | null>(null);
  const sheets = file ? workbookSheets(file) : [];
  const rows = useMemo(
    () => (file ? previewFullImport(file, mappings, emails, dateOrder) : []),
    [file, mappings, emails, dateOrder],
  );
  const errors = rows.filter((row) => row.errors.length),
    valid = rows.filter(
      (row) =>
        !row.errors.length &&
        (row.category !== "clients" || mode === "merge" || !row.existing),
    );
  const currentSheet = sheets[sheetIndex],
    config = mappings[sheetIndex];
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(rows.length / 50) - 1),
  );
  const allClients = rows.every((row) => row.category === "clients");
  function mapColumn(column: number, field: string) {
    setMappings((current) =>
      current.map((mapping, i) => {
        if (i !== sheetIndex) return mapping;
        const fields = Object.fromEntries(
          Object.entries(mapping.fields).filter(
            ([key, index]) => index !== column && key !== field,
          ),
        );
        if (field) fields[field] = column;
        return { ...mapping, fields };
      }),
    );
    setPage(0);
  }
  return (
    <div className="space-y-5" data-testid="complete-import">
      <div className="section-title">
        <div>
          <h2 className="flex items-center gap-2">
            <FileSpreadsheet size={22} />
            {tr("استيراد بيانات العملاء")}
          </h2>
          <p className="text-sm text-muted mt-2">
            {tr(
              "جميع أوراق Excel أو CSV، حتى 10000 صف و5MB. الحقول والتواريخ تُراجع قبل الحفظ، ولا يُستبدل الموجود تلقائيًا.",
            )}
          </p>
        </div>
        <Link
          prefetch={false}
          className="btn-secondary"
          href="/api/export?type=xlsx"
        >
          <Download size={17} />
          {tr("تصدير Excel كامل")}
        </Link>
      </div>
      <form
        className="flex flex-wrap items-end gap-3 rounded-xl border border-dashed bg-canvas p-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setResult(null);
          try {
            const response = await fetch("/api/import", {
              method: "POST",
              body: new FormData(event.currentTarget),
            });
            const data = await response.json();
            if (!response.ok) throw Error(data.error);
            setFile(data);
            setMappings(workbookSheets(data).map(autoMapping));
            setSheetIndex(0);
            setPartial(false);
            setIgnoreUnmapped(false);
            setPage(0);
          } catch (error) {
            setResult({
              ok: false,
              message:
                error instanceof Error ? error.message : "تعذر قراءة الملف",
            });
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="flex-1">
          {tr("ملف البيانات")}
          <input
            id="import-file"
            name="file"
            type="file"
            accept=".csv,.xlsx"
            className="field mt-1"
            required
          />
        </label>
        <button className="btn-secondary" disabled={busy}>
          <Upload size={17} />
          {busy ? tr("نقرأ الملف…") : tr("قراءة ومعاينة")}
        </button>
      </form>
      {file && config && currentSheet && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <label>
              {tr("الورقة")}
              <select
                aria-label={tr("ورقة الاستيراد")}
                className="field"
                value={sheetIndex}
                onChange={(e) => setSheetIndex(Number(e.target.value))}
              >
                {sheets.map((sheet, i) => (
                  <option key={i} value={i}>
                    {sheet.name} · {sheet.rows.length} {tr("صف")}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {tr("نوع البيانات")}
              <select
                aria-label={tr("نوع بيانات الورقة")}
                className="field"
                value={config.category}
                onChange={(e) => {
                  setMappings((current) =>
                    current.map((m, i) =>
                      i === sheetIndex
                        ? { ...m, category: e.target.value as Category }
                        : m,
                    ),
                  );
                  setPage(0);
                }}
              >
                {Object.entries(categories).map(([key, label]) => (
                  <option key={key} value={key}>
                    {tr(label)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {tr("ترتيب التاريخ")}
              <select
                aria-label={tr("ترتيب التاريخ")}
                className="field"
                value={dateOrder}
                onChange={(e) => setDateOrder(e.target.value as "DMY" | "MDY")}
              >
                <option value="DMY">{tr("يوم / شهر / سنة")}</option>
                <option value="MDY">{tr("شهر / يوم / سنة")}</option>
              </select>
            </label>
          </div>
          <details className="card p-4" open>
            <summary>
              {tr("ربط الأعمدة ·")} {currentSheet.name}
            </summary>
            <p className="text-xs text-muted my-3">
              {tr(
                "كل عمود يُربط بحقل واحد. يمكن ربط القياسات المخصصة باسم العمود. الأعمدة غير المربوطة تظهر في التقرير ولا تُتجاهل دون اختيارك.",
              )}
            </p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {currentSheet.headers.map((header, column) => {
                const field =
                  Object.entries(config.fields).find(
                    ([, i]) => i === column,
                  )?.[0] ?? "";
                return (
                  <label key={column} className="text-sm">
                    {header}
                    <select
                      id={`column-map-${sheetIndex}-${column}`}
                      aria-label={tr(
                        "ربط عمود {0} في {1}",
                        String(header),
                        String(currentSheet.name),
                      )}
                      className="field mt-1"
                      value={field}
                      onChange={(e) => mapColumn(column, e.target.value)}
                    >
                      <option value="">{tr("غير مربوط")}</option>
                      {Object.entries(fieldLabels).map(([key, label]) => (
                        <option key={key} value={key}>
                          {tr(label)}
                        </option>
                      ))}
                      <option
                        value={
                          field.startsWith("custom:")
                            ? field
                            : "custom:" + header.slice(0, 60)
                        }
                      >
                        {tr("قياس مخصص:")} {header}
                      </option>
                    </select>
                  </label>
                );
              })}
            </div>
          </details>
          <div className="flex flex-wrap gap-5 text-sm">
            <span>
              {tr("إجمالي الصفوف")} <strong>{rows.length}</strong>
            </span>
            <span>
              {tr("غير صالحة")} <strong>{errors.length}</strong>
            </span>
            <span>
              {tr("قابلة للاستيراد")} <strong>{valid.length}</strong>
            </span>
            <span>
              {tr("أوراق الملف")} <strong>{sheets.length}</strong>
            </span>
          </div>
          <div className="overflow-x-auto card">
            <table>
              <thead>
                <tr>
                  <th>{tr("الورقة / الصف")}</th>
                  <th>{tr("العميل")}</th>
                  <th>{tr("البيانات")}</th>
                  <th>{tr("المراجعة")}</th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .slice(currentPage * 50, currentPage * 50 + 50)
                  .map((row, i) => (
                    <tr key={i}>
                      <td>
                        {row.sheet} · {row.row}
                      </td>
                      <td>
                        <span dir="ltr">{row.email || tr("قالب")}</span>
                        <p className="text-xs text-muted">{row.values.name}</p>
                      </td>
                      <td>
                        {tr(categories[row.category])}
                        <p className="text-xs text-muted">
                          {row.data?.entry_date || row.values.start_date || ""}
                        </p>
                      </td>
                      <td>
                        {row.errors.length ? (
                          <span className="text-red-700">
                            {row.errors.join("؛ ")}
                          </span>
                        ) : row.existing && row.category === "clients" ? (
                          mode === "skip" ? (
                            tr("موجود — سيُتخطى")
                          ) : (
                            tr("موجود — تحديث صريح للحقول المربوطة")
                          )
                        ) : (
                          tr("صالح")
                        )}
                        {row.warnings.length > 0 && (
                          <p className="text-xs text-amber-800">
                            {row.warnings.join("؛ ")}
                          </p>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-muted">
              {rows.length ? currentPage * 50 + 1 : 0}–
              {Math.min(currentPage * 50 + 50, rows.length)} {tr("من")}{" "}
              {rows.length}
            </span>
            <div className="flex gap-2">
              <button
                className="btn-secondary"
                disabled={!currentPage}
                onClick={() => setPage(currentPage - 1)}
              >
                {tr("السابق")}
              </button>
              <button
                className="btn-secondary"
                disabled={(currentPage + 1) * 50 >= rows.length}
                onClick={() => setPage(currentPage + 1)}
              >
                {tr("التالي")}
              </button>
            </div>
          </div>
          <div className="space-y-3 rounded-xl border bg-white p-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={mode === "merge"}
                onChange={(e) => setMode(e.target.checked ? "merge" : "skip")}
              />
              {tr(
                "تحديث معلومات العملاء الموجودة بالحقول المربوطة فقط. السجلات التاريخية تضاف ولا تستبدل.",
              )}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={partial}
                onChange={(e) => setPartial(e.target.checked)}
              />
              {tr("تجاوز الصفوف غير الصالحة صراحة واستيراد الصفوف الصالحة فقط")}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={ignoreUnmapped}
                onChange={(e) => setIgnoreUnmapped(e.target.checked)}
              />
              {tr("راجعت الأعمدة غير المربوطة وأوافق على عدم استيرادها")}
            </label>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              className="btn"
              disabled={
                busy ||
                !valid.length ||
                (!partial && errors.length > 0) ||
                (!ignoreUnmapped && rows.some((row) => row.warnings.length))
              }
              onClick={async () => {
                setBusy(true);
                try {
                  const response = await applyFullImport({
                    file,
                    mappings,
                    mode,
                    partial,
                    ignore_unmapped: ignoreUnmapped,
                    date_order: dateOrder,
                  });
                  setResult(response);
                  if (response.ok) router.refresh();
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy
                ? tr("نحفظ البيانات…")
                : tr(
                    "استيراد {0} {1}",
                    String(valid.length),
                    String(allClients ? tr("عميل") : tr("سجل")),
                  )}
            </button>
            <button
              className="btn-secondary"
              onClick={() =>
                download(
                  "import-review.csv",
                  "\uFEFF" +
                    [
                      [
                        "sheet",
                        "row",
                        "email",
                        "category",
                        "errors",
                        "warnings",
                      ],
                      ...rows.map((row) => [
                        row.sheet,
                        row.row,
                        row.email,
                        row.category,
                        row.errors.join("; "),
                        row.warnings.join("; "),
                      ]),
                    ]
                      .map((row) => row.map(csvCell).join(","))
                      .join("\r\n"),
                  "text/csv;charset=utf-8",
                )
              }
            >
              <Download size={17} />
              {tr("تنزيل تقرير الأخطاء والمعاينة")}
            </button>
          </div>
        </>
      )}
      <Notice result={result} />
      {result?.ok && result.data != null && (
        <div className="card p-4">
          <h3>{tr("تقرير الدفعة")}</h3>
          <div className="grid grid-cols-2 gap-3 my-4">
            {Object.entries({
              clients_created: "عملاء جدد",
              clients_updated: "عملاء تم تحديثهم",
              records_inserted: "سجلات تاريخية",
              skipped: "صفوف متخطاة",
            }).map(([key, label]) => (
              <p key={key} className="text-sm">
                {tr(label)}:{" "}
                <strong>
                  {String((result.data as Record<string, unknown>)[key] ?? 0)}
                </strong>
              </p>
            ))}
          </div>
          <button
            className="btn-secondary"
            onClick={() =>
              download(
                "import-result.json",
                JSON.stringify(result.data, null, 2),
                "application/json",
              )
            }
          >
            {tr("تنزيل تقرير الاستيراد")}
          </button>
        </div>
      )}
      {batches.length > 0 && (
        <details className="card p-4">
          <summary>{tr("دفعات الاستيراد والتراجع")}</summary>
          <div className="space-y-3 mt-4">
            {batches.map((batch) => (
              <div
                className="flex flex-wrap justify-between items-center gap-3 border-b pb-3"
                key={batch.id}
              >
                <div>
                  <span>
                    {new Date(batch.created_at).toLocaleString("ar-SA")}
                  </span>
                  <p className="text-xs text-muted">
                    {batch.status === "undone" ? tr("تم التراجع") : tr("مطبقة")}{" "}
                    · {String(batch.report.records_inserted ?? 0)}{" "}
                    {tr("سجل تاريخي")}
                  </p>
                </div>
                <button
                  className="btn-secondary"
                  disabled={
                    busy ||
                    batch.status !== "applied" ||
                    batch.report.reversible === false
                  }
                  onClick={async () => {
                    if (
                      !window.confirm(
                        "التراجع يزيل تغييرات الدفعة التي لم تُعدل بعدها. العمليات المالية لا تُحذف. تتابع؟",
                      )
                    )
                      return;
                    setBusy(true);
                    const response = await manage("import_undo", {
                      id: batch.id,
                    });
                    setResult(response);
                    setBusy(false);
                    if (response.ok) router.refresh();
                  }}
                >
                  <RotateCcw size={16} />
                  {tr("التراجع عن الدفعة")}
                </button>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
