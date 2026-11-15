import { Activity, Check, Dumbbell, MoreHorizontal, Plus, Users, Utensils } from "lucide-react";

/** Illustration of the product, never presented as live customer data. */
export function ProductPreview({ compact = false }: { compact?: boolean }) {
  return <div className={`product-preview${compact?" preview-compact":""}`} aria-label="معاينة توضيحية لواجهة المنصة" dir="rtl">
    <div className="preview-top"><div className="preview-avatar"><Dumbbell size={20}/></div><div><strong>مساحة المدرب</strong><span>كل شيء في مكانه</span></div><MoreHorizontal size={20}/></div>
    <div className="preview-heading"><div><small>يوم جديد. تقدّم جديد.</small><p className="preview-title">صباح الأهداف الجديدة ✨</p></div><span className="preview-add"><Plus size={16}/></span></div>
    <div className="preview-metrics"><div><Users size={17}/><small>متدربوك</small><strong>متابعة أقرب</strong></div><div><Activity size={17}/><small>مسار التقدم</small><strong>صورة أوضح</strong></div></div>
    <div className="preview-chart"><div><strong>كل خطوة تصنع فرقًا</strong><span>الالتزام يبدأ ببرنامج واضح</span></div><svg viewBox="0 0 420 110" role="img" aria-label="رسم توضيحي لمسار التقدم"><defs><linearGradient id={compact?"preview-fill-compact":"preview-fill"} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity=".22"/><stop offset="100%" stopColor="currentColor" stopOpacity="0"/></linearGradient></defs><path d="M0 93C40 90 48 53 85 65S132 95 170 60S210 63 250 38S290 55 330 26S375 35 420 8V110H0Z" fill={`url(#${compact?"preview-fill-compact":"preview-fill"})`}/><path d="M0 93C40 90 48 53 85 65S132 95 170 60S210 63 250 38S290 55 330 26S375 35 420 8" stroke="currentColor" strokeWidth="3" fill="none"/></svg></div>
    <div className="preview-program"><span><Dumbbell size={19}/></span><div><strong>برنامج مصمم لهدفه</strong><small>تمارين، مجموعات، وتفاصيلك الخاصة</small></div><span className="preview-check"><Check size={16}/></span></div>
    <div className="preview-program"><span><Utensils size={19}/></span><div><strong>تدريب وتغذية. معًا.</strong><small>برنامجه اليومية متاحة من جواله</small></div><span className="preview-check"><Check size={16}/></span></div>
    <p className="preview-caption">معاينة توضيحية للواجهة</p>
  </div>;
}
