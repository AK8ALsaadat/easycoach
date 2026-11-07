import Link from "next/link";
import { Dumbbell } from "lucide-react";
export function Brand({ light = false }: { light?: boolean }) {
  return (
    <Link
      href="/"
      className={`flex items-center gap-3 font-bold ${light ? "text-white" : "text-ink"}`}
    >
      <span className="brand-mark">
        <Dumbbell size={27} strokeWidth={2.7} />
      </span>
      <span className="text-lg">
        إيزي كوتش
        <span
          className={`block text-[10px] font-normal tracking-wide ${light ? "text-white/40" : "text-muted"}`}
        >
          بوابتك لإدارة التدريب
        </span>
      </span>
    </Link>
  );
}
