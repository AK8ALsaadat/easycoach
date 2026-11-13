"use client";
import { useId, type ReactNode } from "react";
import { X } from "lucide-react";
import { useDialog } from "./use-dialog";
import { useLocale } from "./locale-provider";

/** Accessible dialog built on the shared focus-trap hook and existing modal styles. */
export function Modal({
  open,
  onClose,
  title,
  children,
  className = "max-w-lg",
  initialFocus,
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  className?: string;
  initialFocus?: string;
  dismissible?: boolean;
}) {
  const { t: tr } = useLocale();
  const titleId = useId();
  const close = () => {
    if (dismissible) onClose();
  };
  const ref = useDialog<HTMLDivElement>(open, close, initialFocus);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={close}>
      <div
        ref={ref}
        className={`modal-sheet ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-lg">{title}</h2>
          {dismissible && (
            <button type="button" className="icon-button" aria-label={tr("إغلاق")} onClick={onClose}>
              <X size={18} />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

/** Two-button confirmation built on Modal; the cancel button is always explicit. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = "إلغاء",
  danger = false,
  busy = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: ReactNode;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}) {
  const { t: tr } = useLocale();
  return (
    <Modal open={open} onClose={onClose} title={title} dismissible={!busy} initialFocus="[data-confirm-cancel]">
      {children ? <div className="text-sm leading-7 text-muted">{children}</div> : null}
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" className={danger ? "btn btn-danger" : "btn"} disabled={busy} onClick={() => void onConfirm()}>
          {tr(confirmLabel)}
        </button>
        <button type="button" className="btn-secondary" data-confirm-cancel disabled={busy} onClick={onClose}>
          {tr(cancelLabel)}
        </button>
      </div>
    </Modal>
  );
}
