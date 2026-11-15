"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ChevronLeft, Dumbbell, Settings, Users } from "lucide-react";
import { useLocale } from "./locale-provider";

const destinations = [
  { href: "/coach", label: "اليوم", icon: CalendarDays },
  { href: "/coach/clients", label: "المتدربون", icon: Users },
  { href: "/coach/library", label: "مكتبة التدريب", icon: Dumbbell },
  { href: "/coach/settings", label: "الإعدادات", icon: Settings },
];

/** Kept outside Workspace so existing editor, session and sidebar state is preserved. */
export function CoachNavigation() {
  const path = usePathname();
  const { t } = useLocale();
  if (!/^\/coach(?:\/|$)/.test(path) || path.endsWith("/preview")) return null;
  const current = destinations.find(item => item.href !== "/coach" && path.startsWith(item.href)) ?? destinations[0];
  const editing = path.endsWith("/edit");
  return <>
    <nav className="coach-path" aria-label={t("مسار التنقل")}>
      <Link href="/coach">{t("إيزي كوتش")}</Link><ChevronLeft size={14} aria-hidden="true" />
      {path === current.href ? <span aria-current="page">{t(current.label)}</span> : <><Link href={current.href}>{t(current.label)}</Link><ChevronLeft size={14} aria-hidden="true" /><span aria-current="page">{t(editing ? "تعديل البرنامج" : "ملف المتدرب")}</span></>}
    </nav>
    {!editing && <nav className="coach-bottom-nav" aria-label={t("التنقل السريع للمدرب")}>
      {destinations.map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={href === current.href ? "page" : undefined}><Icon size={21} aria-hidden="true" /><span>{t(label)}</span></Link>)}
    </nav>}
  </>;
}
