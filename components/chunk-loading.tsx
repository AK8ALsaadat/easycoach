"use client";
import { useLocale } from "./locale-provider";

export function ChunkLoading() {
  const { t } = useLocale();
  return <div className="card min-h-40 p-6" role="status" aria-busy="true"><p>{t("نجهّز مساحتك…")}</p><div className="mt-4 h-16 animate-pulse rounded-xl bg-canvas" /></div>;
}
