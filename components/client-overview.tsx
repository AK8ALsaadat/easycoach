"use client";
import { countLabel, formatNumber, formatSigned, nouns } from "@/lib/plural";
import Link from "next/link";
import { ArrowUpLeft, Dumbbell, Flame, Scale, Target } from "lucide-react";
import type { Client, Snapshot } from "@/lib/model";
import { clientInsights } from "@/lib/client-insights";
import { useLocale } from "./locale-provider";
import { ProgressChart } from "./progress-chart";
import { ProgressPhotos } from "./progress-photo-panel";
import { MacroSplitBar } from "./macro-targets";

export function ClientOverview({data,client}:{data:Snapshot;client:Client}) {
  const {t:tr,language}=useLocale();const insight=clientInsights(data,client.id);
  const edit=`/coach/clients/${client.id}/edit`;
  const metrics=[
    {label:"آخر وزن مسجل",value:insight.weights.at(-1)?formatNumber(insight.weights.at(-1)!.value):"—",unit:"كجم",icon:Scale},
    {label:"تغير الوزن منذ أول تسجيل",value:insight.weightChange===null?"—":formatSigned(insight.weightChange),unit:"كجم",icon:Target},
    {label:"هدف السعرات الحالي",value:insight.nutrition?.calories?formatNumber(insight.nutrition.calories):"—",unit:"سعرة",icon:Flame},
    {label:"متوسط السعرات المسجلة آخر 7 أيام",value:insight.averageCalories===null?"—":formatNumber(Math.round(insight.averageCalories)),unit:"سعرة",icon:Flame},
  ];
  return <div className="client-overview" data-testid="client-overview">
    <section className="client-overview-heading"><div><p className="eyebrow">{tr("ملخص المتدرب")}</p><h2>{tr("التقدم والخطة في مكان واحد")}</h2><p>{tr("بيانات المتدرب المسجلة، مع فصل الهدف عن التسجيل الفعلي.")}</p></div><div className="flex flex-wrap gap-2"><Link className="btn" href={edit}><Dumbbell size={16}/>{tr("تعديل الجدول")}</Link><Link className="btn-secondary" href={`${edit}?tab=nutrition`}><Flame size={16}/>{tr("تعديل السعرات")}</Link><a className="btn-secondary" href="#client-progress-photos">{tr("صور التقدم")} ({insight.photos.length})</a></div></section>
    <div className="client-insight-metrics">{metrics.map(metric=><section className="card p-5" key={metric.label}><metric.icon size={18} className="text-teal"/><p>{tr(metric.label)}</p><strong><bdi dir="ltr">{metric.value}</bdi> <small>{tr(metric.unit)}</small></strong></section>)}</div>
    <div className="client-insight-charts">
      <ProgressChart title={tr("تطور الوزن")} points={insight.weights} target={insight.goal?.target_weight} defaultRange="all"/>
      <div><ProgressChart title={tr("السعرات الفعلية المسجلة")} points={insight.actualCalories} target={insight.nutrition?.calories} unit="kcal" defaultRange="all"/><p className="client-chart-note">{tr("الخط المتقطع يمثل هدف السعرات الحالي. الأيام غير المسجلة لا تُحسب صفرًا.")}</p></div>
      <ProgressChart title={tr("تاريخ تغير هدف السعرات")} points={insight.calorieTargets} unit="سعرة" defaultRange="all"/>
      <section className="card p-5 client-current-plan"><h2>{tr("الخطة الحالية")}</h2><h3>{insight.published?.name??tr("لا يوجد برنامج منشور بعد")}</h3><p>{insight.published?countLabel(language, insight.published.content.days.length, nouns.trainingDay):tr("جهّز الجدول من صفحة التعديل.")}</p><div className="client-macro-summary">{([['protein','البروتين (غ)'],['carbs','الكارب (غ)'],['fat','الدهون (غ)']] as const).map(([key,label])=><div key={key}><span>{tr(label)}</span><strong>{insight.nutrition?.[key]??"—"}</strong></div>)}</div>{insight.nutrition&&<MacroSplitBar value={insight.nutrition}/>}<p>{tr("هدف المتدرب")}: {insight.goal?.goal||tr("لم يُحدد الهدف")}</p><Link className="btn-soft" href={edit}>{tr("فتح صفحة التعديل")}<ArrowUpLeft size={15}/></Link><Link className="text-sm text-teal" href={`/coach/clients/${client.id}?tab=progress`}>{tr("تسجيل الوزن وتعديل الهدف")}</Link></section>
    </div>
    <div id="client-progress-photos"><ProgressPhotos clientId={client.id} photos={insight.photos} coach consent={data.management?.photo_consents?.find(state=>state.client_id===client.id)}/></div>
  </div>;
}
