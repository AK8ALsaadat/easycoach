"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, Upload } from "lucide-react";
import {
  previewImport,
  type ImportFile,
  type Mapping,
} from "@/lib/import-preview";
import { mutate, type Result } from "@/app/actions";
import { Notice } from "./forms";
export function ImportClients({ emails }: { emails: string[] }) {
  const [file, setFile] = useState<ImportFile | null>(null);
  const [mapping, setMapping] = useState<Mapping>({
    name: 0,
    email: 1,
    phone: -1,
  });
  const [overwrite, setOverwrite] = useState(false);
  const [partial, setPartial] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const router = useRouter();
  const rows = file ? previewImport(file, mapping, emails) : [];
  const errors = rows.filter((r) => r.errors.length);
  const existing = rows.filter((r) => r.existing);
  const valid = rows.filter(
    (r) => !r.errors.length && (overwrite || !r.existing),
  );
  const distinct =
    new Set([
      mapping.name,
      mapping.email,
      ...(mapping.phone >= 0 ? [mapping.phone] : []),
    ]).size === (mapping.phone >= 0 ? 3 : 2);
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <FileSpreadsheet className="mt-1 text-teal" />
        <div>
          <h2>استيراد العملاء</h2>
          <p className="mt-1 text-sm text-muted">
            CSV بترميز UTF-8 أو Excel (.xlsx). حتى 2000 صف و5 ميجابايت. نحتاج
            الاسم والإيميل؛ الجوال اختياري.
          </p>
        </div>
      </div>
      <form
        className="flex flex-wrap items-end gap-3 rounded-xl border border-dashed bg-canvas p-5"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setResult(null);
          try {
            const res = await fetch("/api/import", {
              method: "POST",
              body: new FormData(event.currentTarget),
            });
            const value = await res.json();
            if (!res.ok) throw new Error(value.error);
            setFile(value);
            setMapping({
              name: 0,
              email: Math.min(1, value.headers.length - 1),
              phone: -1,
            });
            setPartial(false);
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
        <div className="flex-1">
          <label htmlFor="import-file">ملف العملاء</label>
          <input
            className="field"
            id="import-file"
            name="file"
            type="file"
            accept=".csv,.xlsx"
            required
          />
        </div>
        <button className="btn-secondary" disabled={busy}>
          <Upload size={16} />
          {busy ? "نقرأ الملف…" : "قراءة ومعاينة"}
        </button>
      </form>
      {file ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            {(
              [
                ["name", "عمود الاسم"],
                ["email", "عمود الإيميل"],
                ["phone", "عمود الجوال"],
              ] as const
            ).map(([field, label]) => (
              <div key={field}>
                <label htmlFor={`mapping-${field}`}>{label}</label>
                <select
                  className="field"
                  id={`mapping-${field}`}
                  value={mapping[field]}
                  onChange={(e) =>
                    setMapping((m) => ({
                      ...m,
                      [field]: Number(e.target.value),
                    }))
                  }
                >
                  {field === "phone" ? (
                    <option value={-1}>غير موجود</option>
                  ) : null}
                  {file.headers.map((name, i) => (
                    <option key={i} value={i}>
                      {name} (عمود {i + 1})
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <span className="badge">{rows.length} صف</span>
            <span className="badge text-red-700">
              {errors.length} فيه أخطاء
            </span>
            <span className="badge">{existing.length} موجود مسبقًا</span>
            <span className="badge bg-accent/40 text-teal">
              {valid.length} جاهز للاستيراد
            </span>
          </div>
          <div className="max-h-80 overflow-auto rounded-xl border">
            <table>
              <thead>
                <tr>
                  <th>الصف</th>
                  <th>الاسم</th>
                  <th>الإيميل</th>
                  <th>الجوال</th>
                  <th>النتيجة</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 100).map((r) => (
                  <tr key={r.row}>
                    <td>{r.row}</td>
                    <td>{r.data.name}</td>
                    <td dir="ltr">{r.data.email}</td>
                    <td>{r.data.phone}</td>
                    <td
                      className={
                        r.errors.length ? "text-red-700" : "text-muted"
                      }
                    >
                      {r.errors.join(" · ") ||
                        (r.existing
                          ? overwrite
                            ? "سيتم تحديث الاسم والجوال"
                            : "سيتم التخطي"
                          : "سجل جديد")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 100 ? (
            <p className="text-xs text-muted">
              نعرض أول 100 صف؛ التحقق يشمل جميع الصفوف.
            </p>
          ) : null}
          <label className="flex items-center gap-2 font-normal">
            <input
              type="checkbox"
              checked={overwrite}
              onChange={(e) => setOverwrite(e.target.checked)}
            />
            أوافق على تحديث الاسم والجوال للسجلات الموجودة بنفس الإيميل. لا
            يتغير ارتباط الحساب أو البرامج.
          </label>
          {errors.length ? (
            <label className="flex items-center gap-2 font-normal">
              <input
                type="checkbox"
                checked={partial}
                onChange={(e) => setPartial(e.target.checked)}
              />
              استيراد الصفوف الصحيحة فقط وتخطي الأخطاء المعروضة
            </label>
          ) : null}
          {!distinct ? (
            <p role="alert" className="text-red-700">
              اختر عمودًا مختلفًا لكل حقل.
            </p>
          ) : null}
          <button
            className="btn"
            disabled={
              busy ||
              !valid.length ||
              !distinct ||
              (errors.length > 0 && !partial)
            }
            onClick={async () => {
              setBusy(true);
              try {
                const r = await mutate("import_clients", {
                  rows: valid.map((r) => r.data),
                  overwrite,
                });
                setResult(
                  r.ok
                    ? {
                        ok: true,
                        message:
                          "تمت معالجة الصفوف المحددة. حدّثت قائمة عملائك.",
                      }
                    : r,
                );
                if (r.ok) {
                  setFile(null);
                  router.refresh();
                }
              } finally {
                setBusy(false);
              }
            }}
          >
            استيراد {valid.length} عميل{overwrite ? " / تحديث" : ""}
          </button>
        </>
      ) : null}
      <Notice result={result} />
    </div>
  );
}
