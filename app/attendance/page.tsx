import Link from "next/link";
import { z } from "zod";
import { rpc,requireCoachIdentity } from "@/lib/server";
import { OrganizationForm } from "@/components/organization-controls";
type Package={id:string;name:string;start_date:string;end_date:string;session_limit:number|null;attended:number;remaining:number|null;attendance:string[]};
export const dynamic="force-dynamic";
export default async function AttendancePage({searchParams}:{searchParams:Promise<{after?:string}>}) {
 await requireCoachIdentity();const {after}=await searchParams;
 const clients=await rpc<{id:string;name:string;packages:Package[]}[]>("ec_attendance_roster",{after_client:z.uuid().safeParse(after).success?after:null});
 return <main dir="rtl" className="platform-page"><Link href="/coach" className="platform-back">← مساحة المدرب</Link><h1>الحضور ورصيد الحصص</h1><p className="platform-lead">باقات المتدربين مستقلة عن اشتراك EasyCoach. يحتسب سجل الحضور حصة واحدة في اليوم لكل باقة.</p>
 {clients.map(client=><section key={client.id} className="border rounded-xl p-5 space-y-4"><h2>{client.name}</h2>{client.packages.map(pkg=><article key={pkg.id} className="border rounded-xl p-4 space-y-3"><h3>{pkg.name}</h3><p>{pkg.start_date} — {pkg.end_date}</p><p>الحضور: {pkg.attended} · الرصيد: {pkg.remaining??"لم يُحدد عدد الحصص"}</p><OrganizationForm operation="ec_session_limit" defaults={{subscription:pkg.id}} fields={[{name:"sessions",label:"إجمالي حصص الباقة",type:"number"}]} label="تحديد رصيد الحصص"/>
 <OrganizationForm operation="ec_attendance" defaults={{subscription:pkg.id,attendance_id:crypto.randomUUID()}} fields={[{name:"attendance_date",label:"تاريخ الحضور",type:"date"}]} label="تسجيل حضور"/>
 {pkg.attendance.length>0&&<details><summary>سجل الحضور</summary><ul>{pkg.attendance.map(day=><li key={day}>{day}</li>)}</ul></details>}</article>)}</section>)}
 {clients.length===50&&<Link className="btn" href={`/attendance?after=${clients.at(-1)!.id}`}>الصفحة التالية</Link>}
 </main>;
}
