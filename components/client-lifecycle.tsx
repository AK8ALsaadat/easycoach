"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, Download, MoreHorizontal, RotateCcw, Trash2, TriangleAlert } from "lucide-react";
import type { Client } from "@/lib/model";
import { clientPurgeSummary, purgeClient, setClientArchived, type PurgeSummary } from "@/app/client-lifecycle-actions";
import { countLabel, nouns } from "@/lib/plural";
import { useLocale } from "./locale-provider";
import { Modal } from "./modal";
import { showToast } from "./toast";

const sameName = (a: string, b: string) => a.trim().replace(/\s+/g, " ") === b.trim().replace(/\s+/g, " ");

function useLifecycle(client: Client, afterArchive?: string) {
  const router = useRouter();
  const { t: tr } = useLocale();
  async function restore(withToast = true) {
    const result = await setClientArchived(client.id, false);
    if (withToast) showToast({ message: result.ok ? tr("تمت استعادة {0}", client.name) : result.message, tone: result.ok ? "success" : "error" });
    if (result.ok) router.refresh();
    return result;
  }
  async function archive(reason: string) {
    const result = await setClientArchived(client.id, true, reason);
    if (!result.ok) return result;
    showToast({
      message: tr("تمت أرشفة {0}", client.name),
      action: { label: "تراجع", run: async () => { await restore(); } },
      duration: 5000,
    });
    if (afterArchive) router.push(afterArchive);
    else router.refresh();
    return result;
  }
  return { archive, restore };
}

export function ArchiveDialog({ client, open, onClose, afterArchive }: { client: Client; open: boolean; onClose: () => void; afterArchive?: string }) {
  const { t: tr } = useLocale();
  const { archive } = useLifecycle(client, afterArchive);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal open={open} onClose={() => !busy && onClose()} title={tr("أرشفة {0}", client.name)}>
      <ul className="lifecycle-list">
        <li>{tr("يختفي من قائمة المتدربين الافتراضية ومن إحصائيات النظرة العامة والتنبيهات والتجديدات.")}</li>
        <li>{tr("تبقى كل بياناته محفوظة: البرامج والأوزان والصور والاشتراكات والرسائل.")}</li>
        <li>{tr("يتوقف دخوله لبوابة المتدرب، وتنلغي دعواته المعلّقة وروابطه النشطة.")}</li>
        <li>{tr("تقدر تستعيده في أي وقت من تبويب «المؤرشفون».")}</li>
      </ul>
      <label className="mt-4 block">
        {tr("سبب الأرشفة (اختياري)")}
        <textarea className="field mt-2 min-h-20" maxLength={500} value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} placeholder={tr("مثال: انتهى الاشتراك ولم يجدد")} />
      </label>
      {error && <p role="alert" className="field-error mt-2">{tr(error)}</p>}
      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const result = await archive(reason);
              if (result.ok) {
                setReason("");
                onClose();
              } else setError(result.message);
            } catch {
              setError("تعذر الاتصال. لم نتأكد من الأرشفة؛ حدّث الصفحة وتحقق.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <Archive size={16} aria-hidden="true" />
          {tr(busy ? "جارٍ الأرشفة…" : "أرشفة المتدرب")}
        </button>
        <button type="button" className="btn-secondary" disabled={busy} onClick={onClose}>{tr("إلغاء")}</button>
      </div>
    </Modal>
  );
}

export function PurgeDialog({ client, open, onClose }: { client: Client; open: boolean; onClose: () => void }) {
  const { t: tr, language } = useLocale();
  const router = useRouter();
  const [summary, setSummary] = useState<PurgeSummary | null>(null);
  const [summaryError, setSummaryError] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    let active = true;
    clientPurgeSummary(client.id)
      .then((result) => {
        if (!active) return;
        if (result.ok) setSummary(result.summary);
        else setSummaryError(result.message);
      })
      .catch(() => active && setSummaryError("تعذر تحميل ملخص البيانات."));
    return () => {
      active = false;
    };
  }, [open, client.id]);
  const close = () => {
    if (busy) return;
    setSummary(null);
    setSummaryError("");
    setTyped("");
    setError("");
    onClose();
  };
  const matches = sameName(typed, client.name);
  return (
    <Modal open={open} onClose={close} title={tr("حذف {0} نهائيًا", client.name)} className="max-w-xl" initialFocus="#purge-confirm-name">
      <div className="macro-warning" role="note">
        <TriangleAlert size={18} aria-hidden="true" />
        <p>{tr("هذه العملية ما ترجع. تنحذف كل بيانات المتدرب من قاعدة البيانات، وملفات صور التقدم من التخزين.")}</p>
      </div>
      <h3 className="mt-4 font-semibold">{tr("اللي بينحذف:")}</h3>
      {summary ? (
        <ul className="lifecycle-counts" data-testid="purge-summary">
          <li>{countLabel(language, summary.programs, nouns.program)}</li>
          <li>{countLabel(language, summary.weights, nouns.weight)}</li>
          <li>{countLabel(language, summary.photos, nouns.photo)}</li>
          <li>{countLabel(language, summary.messages, nouns.message)}</li>
          <li>{countLabel(language, summary.subscriptions, nouns.subscription)}</li>
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted" role="status">{tr(summaryError || "نجهّز ملخص البيانات…")}</p>
      )}
      <div className="mt-4 rounded-xl border border-line p-3">
        <p className="text-sm">{tr("قبل الحذف، تقدر تحفظ نسخة من بياناته:")}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <a className="btn-secondary" download href={`/api/export?type=client-json&client=${client.id}`}><Download size={15} aria-hidden="true" />{tr("تصدير بيانات المتدرب (JSON)")}</a>
          <a className="btn-secondary" download href={`/api/export?type=client-csv&client=${client.id}`}><Download size={15} aria-hidden="true" />{tr("تصدير (CSV)")}</a>
        </div>
      </div>
      <label className="mt-4 block" htmlFor="purge-confirm-name">
        {tr("للتأكيد اكتب اسم المتدرب كما هو:")} <strong className="select-all">{client.name}</strong>
      </label>
      <input id="purge-confirm-name" className="field mt-2" autoComplete="off" value={typed} disabled={busy} onChange={(event) => setTyped(event.target.value)} aria-invalid={typed !== "" && !matches} />
      {typed !== "" && !matches && <p className="field-error">{tr("الاسم لا يطابق.")}</p>}
      {error && <p role="alert" className="field-error mt-2">{tr(error)}</p>}
      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-danger"
          disabled={busy || !matches}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const result = await purgeClient(client.id, typed);
              if (!result.ok) {
                setError(result.message);
                return;
              }
              showToast({ message: result.message });
              onClose();
              router.refresh();
            } catch {
              setError("تعذر الاتصال. لم نتأكد من الحذف؛ حدّث الصفحة وتحقق.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <Trash2 size={16} aria-hidden="true" />
          {tr(busy ? "جارٍ الحذف…" : "حذف نهائي")}
        </button>
        <button type="button" className="btn-secondary" disabled={busy} onClick={close}>{tr("إلغاء")}</button>
      </div>
    </Modal>
  );
}

/** "⋯" actions for a trainee: archive when active; restore or delete when archived. */
export function ClientActionsMenu({ client, afterArchive, compact = false }: { client: Client; afterArchive?: string; compact?: boolean }) {
  const { t: tr } = useLocale();
  const { restore } = useLifecycle(client);
  const menu = useRef<HTMLDetailsElement>(null);
  const [dialog, setDialog] = useState<"archive" | "purge" | null>(null);
  const [busy, setBusy] = useState(false);
  const pick = (next: "archive" | "purge") => {
    menu.current?.removeAttribute("open");
    setDialog(next);
  };
  return (
    <>
      <details ref={menu} className={`actions-menu ${compact ? "actions-menu-compact" : ""}`} onKeyDown={(event) => { if (event.key === "Escape") menu.current?.removeAttribute("open"); }}>
        <summary className="btn-secondary" aria-label={tr("إجراءات {0}", client.name)} title={tr("إجراءات")}>
          <MoreHorizontal size={18} aria-hidden="true" />
        </summary>
        <div className="actions-menu-list" role="menu">
          {client.archived ? (
            <>
              <button
                type="button"
                role="menuitem"
                disabled={busy}
                onClick={async () => {
                  menu.current?.removeAttribute("open");
                  setBusy(true);
                  try { await restore(); } finally { setBusy(false); }
                }}
              >
                <RotateCcw size={16} aria-hidden="true" />{tr("استعادة")}
              </button>
              <button type="button" role="menuitem" className="text-danger" onClick={() => pick("purge")}>
                <Trash2 size={16} aria-hidden="true" />{tr("حذف نهائي")}
              </button>
            </>
          ) : (
            <button type="button" role="menuitem" onClick={() => pick("archive")}>
              <Archive size={16} aria-hidden="true" />{tr("أرشفة المتدرب")}
            </button>
          )}
        </div>
      </details>
      {!client.archived && <ArchiveDialog client={client} open={dialog === "archive"} onClose={() => setDialog(null)} afterArchive={afterArchive} />}
      {client.archived && <PurgeDialog client={client} open={dialog === "purge"} onClose={() => setDialog(null)} />}
    </>
  );
}

/** Plain button that opens the archive confirmation. */
export function ArchiveClientTrigger({ client, afterArchive }: { client: Client; afterArchive?: string }) {
  const { t: tr } = useLocale();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>
        <Archive size={15} aria-hidden="true" />{tr("أرشفة العميل")}
      </button>
      <ArchiveDialog client={client} open={open} onClose={() => setOpen(false)} afterArchive={afterArchive} />
    </>
  );
}

/** Visible restore button for archived rows. */
export function RestoreClientButton({ client }: { client: Client }) {
  const { t: tr } = useLocale();
  const { restore } = useLifecycle(client);
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" className="btn-secondary" disabled={busy} onClick={async () => { setBusy(true); try { await restore(); } finally { setBusy(false); } }}>
      <RotateCcw size={15} aria-hidden="true" />{tr(busy ? "جارٍ الاستعادة…" : "استعادة")}
    </button>
  );
}
