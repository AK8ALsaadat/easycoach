"use client";
import { useLocale } from "./locale-provider";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Send, Trash2 } from "lucide-react";
import { manage } from "@/app/management-actions";
import type { Result } from "@/app/actions";
import type { Snapshot } from "@/lib/model";
import { Notice } from "./forms";

export function TemplateTools({ data }: { data: Snapshot }) {
  const { t: tr } = useLocale();

  const router = useRouter();
  const [selected, setSelected] = useState("");
  const [clients, setClients] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [replace, setReplace] = useState(false);
  const [publish, setPublish] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const template = data.templates.find((t) => t.id === selected);
  const metadata = data.management?.template_metadata.find(
    (m) => m.template_id === selected,
  );
  const available = data.clients.filter(
    (c) =>
      !c.archived &&
      `${c.name} ${c.email}`.toLowerCase().includes(query.toLowerCase()),
  );
  async function action(
    command: Parameters<typeof manage>[0],
    payload: unknown,
  ) {
    setBusy(true);
    try {
      const response = await manage(command, payload);
      setResult(response);
      if (response.ok) router.refresh();
      return response;
    } catch {
      const response = {
        ok: false,
        message: "تعذر الاتصال. لم نتأكد من الحفظ؛ أعد المحاولة بنفس البيانات.",
      };
      setResult(response);
      return response;
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card p-5 mb-5" data-testid="template-tools">
      <h2>{tr("إدارة القوالب والتعيين الجماعي")}</h2>
      <p className="text-sm text-muted mt-1">
        {tr(
          "كل تعيين ينشئ نسخة مستقلة. تعديل القالب لاحقًا لا يغيّر نسخ العملاء.",
        )}
      </p>
      <label className="mt-4">
        {tr("القالب")}
        <select
          className="field"
          aria-label={tr("قالب التعيين الجماعي")}
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            setResult(null);
          }}
        >
          <option value="">{tr("اختر قالبًا محفوظًا")}</option>
          {data.templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {data.management?.template_metadata.some(
                (m) => m.template_id === t.id && m.archived,
              )
                ? tr(" · مؤرشف")
                : ""}
            </option>
          ))}
        </select>
      </label>
      {template && (
        <>
          <form
            key={template.id + String(metadata?.archived)}
            className="grid gap-3 mt-4 sm:grid-cols-2"
            onSubmit={async (event) => {
              event.preventDefault();
              const values = new FormData(event.currentTarget);
              await action("template_meta", {
                id: template.id,
                description: String(values.get("description") ?? ""),
                archived: values.get("archived") === "on",
                kind: values.get("kind"),
              });
            }}
          >
            <label>
              {tr("وصف القالب")}
              <textarea
                className="field"
                name="description"
                aria-label={tr("وصف القالب")}
                maxLength={2000}
                defaultValue={metadata?.description ?? ""}
              />
            </label>
            <div className="space-y-3">
              <label>
                {tr("نوع القالب")}
                <select
                  className="field"
                  name="kind"
                  defaultValue={metadata?.kind ?? "workout"}
                >
                  <option value="workout">{tr("برنامج تدريب وتغذية")}</option>
                  <option value="nutrition">
                    {tr("تغذية فقط — يحافظ على أيام تدريب العميل")}
                  </option>
                </select>
              </label>
              <label className="flex gap-2 items-center">
                <input
                  type="checkbox"
                  name="archived"
                  defaultChecked={metadata?.archived ?? false}
                />
                {tr("أرشفة القالب دون حذف البرامج المعيّنة")}
              </label>
              <button className="btn-secondary" disabled={busy}>
                {tr("حفظ بيانات القالب")}
              </button>
            </div>
          </form>
          <div className="flex flex-wrap gap-2 mt-4">
            <button
              className="btn-secondary"
              disabled={busy}
              onClick={() => action("template_duplicate", { id: template.id })}
            >
              <Copy size={16} />
              {tr("نسخ القالب كاملًا")}
            </button>
            <button
              className="btn-secondary text-red-700"
              disabled={busy}
              onClick={async () => {
                if (
                  !window.confirm(
                    "حذف القالب نهائيًا؟ برامج العملاء المستقلة ستبقى كما هي.",
                  )
                )
                  return;
                const response = await action("template_delete", {
                  id: template.id,
                });
                if (response.ok) setSelected("");
              }}
            >
              <Trash2 size={16} />
              {tr("حذف القالب")}
            </button>
          </div>
          <div className="border-t mt-5 pt-5">
            <h3>{tr("تعيين لعميل أو مجموعة")}</h3>
            {metadata?.kind === "nutrition" && (
              <p className="text-sm text-muted mt-2">
                {tr(
                  "قالب التغذية يحافظ على اسم البرنامج وأيام التدريب؛ يحتاج العميل برنامجًا قائمًا. للأهداف المستقلة استخدم ملف العميل.",
                )}
              </p>
            )}
            <input
              aria-label={tr("بحث قائمة التعيين")}
              className="field my-3"
              placeholder={tr("ابحث بالاسم أو الإيميل")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="flex flex-wrap gap-3 mb-3">
              <button
                className="btn-soft"
                onClick={() => setClients(available.map((c) => c.id))}
              >
                {tr("تحديد نتائج البحث (")}
                {available.length})
              </button>
              <button className="btn-secondary" onClick={() => setClients([])}>
                {tr("إلغاء التحديد")}
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto rounded-lg border p-3 grid gap-2 sm:grid-cols-2">
              {available.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={clients.includes(c.id)}
                    onChange={(e) =>
                      setClients((current) =>
                        e.target.checked
                          ? [...current, c.id]
                          : current.filter((id) => id !== c.id),
                      )
                    }
                  />
                  <span>
                    {c.name}
                    <small className="block text-muted">{c.email}</small>
                  </span>
                </label>
              ))}
            </div>
            <div className="space-y-2 my-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={replace}
                  onChange={(e) => setReplace(e.target.checked)}
                />
                {tr("أوافق على استبدال المسودات الحالية للعملاء المحددين")}
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={publish}
                  onChange={(e) => setPublish(e.target.checked)}
                />
                {tr(
                  "انشر النسخ الجديدة للمتدربين الآن؛ بدون هذا الخيار تُحفظ كمسودات",
                )}
              </label>
            </div>
            <button
              className="btn"
              disabled={busy || !clients.length || metadata?.archived}
              onClick={() => {
                if (
                  replace &&
                  !window.confirm(
                    "ستستبدل المسودات الحالية للعملاء المحددين. النسخ المنشورة لا تتغير إلا إذا اخترت النشر. تتابع؟",
                  )
                )
                  return;
                void action("template_assign", {
                  id: template.id,
                  clients,
                  replace_drafts: replace,
                  publish,
                });
              }}
            >
              <Send size={17} />
              {tr("تعيين")} {clients.length} {tr("نسخة مستقلة")}
            </button>
          </div>
        </>
      )}
      <Notice result={result} />
    </section>
  );
}
