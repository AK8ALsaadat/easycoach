"use client";
import { starterContent, starterPrograms } from "@/lib/starter-programs";
import type { Content } from "@/lib/model";
import { useLocale } from "./locale-provider";

export function StarterPrograms({ onChoose }: { onChoose: (content: Content, name: string) => void }) {
  const { t } = useLocale();
  return <section className="card p-5 mb-5" aria-label={t("قوالب البداية")}>
    <h2>{t("ابدأ من برنامج جاهز")}</h2>
    <p className="text-sm text-muted mt-2 mb-4">{t("انسخ قالبًا إلى مكتبتك، ثم عدّل التمارين والمجموعات حسب متدربك قبل النشر.")}</p>
    <div className="grid gap-4 sm:grid-cols-2">{starterPrograms.map(program => <article key={program.key} className="rounded-xl border p-4">
      <h3>{t(program.name)}</h3><p className="text-sm text-muted mt-2 mb-3">{t(program.description)}</p>
      <button type="button" className="btn-secondary" onClick={() => onChoose(starterContent(program.key), program.name)}>{t("تخصيص القالب")}</button>
    </article>)}</div>
  </section>;
}
