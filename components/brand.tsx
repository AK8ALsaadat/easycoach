"use client";
import { useLocale } from "./locale-provider";
import Link from "next/link";
import { Dumbbell } from "lucide-react";
export function Brand({ light = false }: { light?: boolean }) {
  const { t: tr } = useLocale();

  return (
    <Link
      href="/"
      className={`flex items-center gap-3 font-bold ${light ? "text-white" : "text-ink"}`}
    >
      <span className="brand-mark">
        <Dumbbell size={27} strokeWidth={2.7} />
      </span>
      <span className="text-lg">
        {tr("إيزي كوتش")}
        <span
          className={`block text-xs font-normal tracking-wide ${light ? "text-white/40" : "text-muted"}`}
        >
          {tr("بوابتك لإدارة التدريب")}
        </span>
      </span>
    </Link>
  );
}
