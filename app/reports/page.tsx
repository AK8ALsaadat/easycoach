import Link from "next/link";
import { z } from "zod";
import { requireCoachIdentity,rpc } from "@/lib/server";
export const dynamic="force-dynamic";
export default async function ReportsPage({searchParams}:{searchParams:Promise<{owner?:string;branch?:string;member?:string;after_branch?:string}>}) {
 const user=await requireCoachIdentity();const search=await searchParams;
 const valid=(v?:string)=>z.uuid().safeParse(v).success?v:null;
 let report:Record<string,number|null>|null=null;
 let advanced:Record<string,number>|null=null;
 let comparison:{id:string;name:string;report:Record<string,number|null>}[]=[];
 let coaches:typeof comparison=[];
 try{report=await rpc("ec_report",{owner:valid(search.owner)??user.id,branch:valid(search.branch),member:valid(search.member)});}catch{}
 if(report){
  const results=await Promise.allSettled([
   !valid(search.branch)&&!valid(search.member)?rpc<Record<string,number>>("ec_advanced_report",{owner:valid(search.owner)??user.id}):Promise.resolve(null),
   rpc<typeof comparison>("ec_comparison",{owner:valid(search.owner)??user.id,after_branch:valid(search.after_branch)}),
   rpc<typeof comparison>("ec_coach_comparison",{owner:valid(search.owner)??user.id}),
  ]);
  if(results[0].status==="fulfilled") advanced=results[0].value;
  if(results[1].status==="fulfilled") comparison=results[1].value;
  if(results[2].status==="fulfilled") coaches=results[2].value;
 }
 const labels:Record<string,string>={active_clients:"المتدربون النشطون",attendance:"الحصص المسجلة",renewals:"التجديدات",paid_sar:"المحصّل المسجل (ريال)",outstanding_sar:"المستحق (ريال)",completed_workouts:"التمارين المكتملة المسجلة",recorded_workouts:"سجلات التمرين",expiring_packages:"باقات تنتهي خلال 7 أيام",inactive_clients:"بلا نشاط منذ 14 يومًا",weight_records:"سجلات الوزن",measurements:"سجلات القياسات"};
 return <main dir="rtl" className="max-w-4xl mx-auto p-6 space-y-6"><Link href="/organization">← الفريق</Link><h1>التقارير من السجلات الفعلية</h1>{report?<div className="grid sm:grid-cols-2 gap-4">{Object.entries({...report,...advanced}).map(([key,value])=><section className="border rounded-xl p-5" key={key}><h2>{labels[key]??key}</h2><p>{value===null?"لا توجد بيانات مسجلة":value}</p></section>)}</div>:<p>لا تتوفر صلاحية التقرير لهذه الباقة أو لهذا النطاق. <Link href="/pricing">مقارنة الباقات</Link></p>}{comparison.length>0&&<section className="space-y-4"><h2>مقارنة الفروع</h2>{comparison.map(b=><article className="border p-4 rounded-xl" key={b.id}><h3>{b.name}</h3>{Object.entries(b.report).map(([key,value])=><p key={key}>{labels[key]??key}: {value??"لا توجد بيانات مسجلة"}</p>)}</article>)}{comparison.length===50&&<Link className="btn" href={`/reports?owner=${valid(search.owner)??user.id}&after_branch=${comparison.at(-1)!.id}`}>الفروع التالية</Link>}</section>}{coaches.length>0&&<section className="space-y-4"><h2>مقارنة المدربين</h2><div className="overflow-auto"><table className="w-full text-start"><thead><tr>{["المدرب","المتدربون النشطون","الحضور","التجديدات"].map(label=><th className="p-3 text-start" key={label}>{label}</th>)}</tr></thead><tbody>{coaches.map(coach=><tr className="border-b" key={coach.id}><th className="p-3 text-start">{coach.name}</th><td className="p-3">{coach.report.active_clients}</td><td className="p-3">{coach.report.attendance}</td><td className="p-3">{coach.report.renewals}</td></tr>)}</tbody></table></div><p className="text-sm text-muted">المتدربون غير المسندين يحتسبون للمالك.</p></section>}</main>;
}
