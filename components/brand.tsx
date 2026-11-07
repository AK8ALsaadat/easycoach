import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
export function Brand({ light = false }: { light?: boolean }) {
  return (
    <Link
      href="/"
      className={`flex items-center gap-3 font-bold ${light ? "text-white" : "text-ink"}`}
    >
      <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-ink">
        <ArrowUpRight size={26} strokeWidth={2.5} />
      </span>
      <span className="text-lg">
        مساحة المدرب
        <span
          className={`block text-[10px] font-normal tracking-wide ${light ? "text-white/40" : "text-muted"}`}
        >
          تركيزك على التدريب. والباقي هنا.
        </span>
      </span>
    </Link>
  );
}
