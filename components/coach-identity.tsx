/* eslint-disable @next/next/no-img-element -- Small sanitized branding served by our image endpoint. */
import { avatarUrl, type CoachBranding } from "@/lib/coach-branding";
export function CoachIdentity({ branding, fallback = "مدربك" }: { branding?: CoachBranding | null; fallback?: string }) {
  return <div className="flex min-w-0 items-center gap-3 py-3" aria-label="هوية المدرب">
    <img key={avatarUrl(branding)} src={avatarUrl(branding)} width={56} height={56} className="h-14 w-14 shrink-0 rounded-full object-cover" alt="" referrerPolicy="no-referrer" />
    <div className="min-w-0"><p className="text-xs opacity-70">مدربك</p><p className="break-words font-semibold" dir="auto">{branding?.name || fallback}</p></div>
  </div>;
}
