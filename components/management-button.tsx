"use client";
import { useLocale } from "./locale-provider";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { manage } from "@/app/management-actions";
export function ManagementButton({
  command,
  payload,
  children,
  confirmation,
}: {
  command: Parameters<typeof manage>[0];
  payload: unknown;
  children: React.ReactNode;
  confirmation?: string;
}) {
  const { t: tr } = useLocale();

  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <span>
      <button
        type="button"
        className="btn-secondary"
        disabled={busy}
        onClick={async () => {
          if (confirmation && !window.confirm(tr(confirmation))) return;
          setBusy(true);
          try {
            const result = await manage(command, payload);
            if (result.ok) router.refresh();
            else setError(result.message);
          } catch {
            setError(
              "تعذر الاتصال. لم نتأكد من الحفظ؛ أعد المحاولة بنفس البيانات.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {children}
      </button>
      {error && (
        <span role="alert" className="block text-xs text-red-700 mt-2">
          {tr(error)}
        </span>
      )}
    </span>
  );
}
