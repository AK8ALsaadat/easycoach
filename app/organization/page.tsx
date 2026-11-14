import Link from "next/link";
import { z } from "zod";
import { rpc, requireCoachIdentity } from "@/lib/server";
import { OrganizationForm, BulkOperations } from "@/components/organization-controls";

type Option = { id: string; name: string };
type Task = { id: string; client_id: string; assignee_id: string; title: string; due_at: string; status: string };
type Rule = { id: string; event: string; threshold: number; action: string; enabled: boolean };
type Org = {
  features: string[]; clients: (Option & { email: string })[];
  members: (Option & { role: string; active: boolean; accepted: boolean })[];
  branches: (Option & { active: boolean })[];
  tasks: Task[]; rules: Rule[];
  audit: { id: number; action: string; created_at: string }[];
};
const events = [{ id: "expiry", name: "قرب انتهاء الباقة بالأيام" }, { id: "low_sessions", name: "انخفاض الحصص المتبقية" }, { id: "inactive", name: "الانقطاع بالأيام" }];
const actions = [{ id: "task", name: "إنشاء مهمة" }, { id: "email", name: "إضافة بريد للطابور" }, { id: "both", name: "مهمة وبريد بالطابور" }];
export const dynamic = "force-dynamic";
export default async function OrganizationPage({ searchParams }: {
  searchParams: Promise<{ owner?: string; after?: string; branch?: string; member?: string; task_after?: string; task_id?: string; task_status?: string }>
}) {
  const user = await requireCoachIdentity();
  const search = await searchParams;
  const nullable = (value?: string) => z.uuid().safeParse(value).success ? value! : null;
  const owner = nullable(search.owner) ?? user.id;
  const own = owner === user.id;
  const homes = await rpc<{ owner: string; name: string; accepted: boolean }[]>("ec_team_homes");
  let org: Org | null = null;
  try { org = await rpc<Org>("ec_org_page", { owner, after_client: nullable(search.after), branch: nullable(search.branch), member: nullable(search.member) }); } catch { }
  const business = org?.features.includes("branches") ?? false;
  const templates = own && business ? (await rpc<{ templates: Option[] }>("ec_resource_options")).templates : [];
  const members = org?.members.filter(member => member.active && member.accepted) ?? [];
  const branches = org?.branches.filter(branch => branch.active) ?? [];
  const taskStatus = search.task_status === "done" ? "done" : "open";
  if (org && business) org.tasks = await rpc<Task[]>("ec_task_page", {
    owner, task_status: taskStatus,
    after_due: z.iso.datetime({ offset: true }).safeParse(search.task_after).success ? search.task_after : null,
    after_id: nullable(search.task_id),
  });
  const filteredParams = new URLSearchParams({ owner });
  if (nullable(search.branch)) filteredParams.set("branch", search.branch!);
  if (nullable(search.member)) filteredParams.set("member", search.member!);
  const lastTask = org?.tasks.at(-1);
  return <main dir="rtl" className="platform-page platform-page-wide">
    <div className="flex justify-between"><Link href="/coach" className="platform-back">← مساحة المدرب</Link><Link href="/subscription" className="btn-secondary">الاشتراك</Link></div>
    <h1>الفريق والفروع والمتابعات</h1>
    {homes.length > 0 && <section className="space-y-3"><h2>مساحات الفريق</h2>{homes.map(home => <div key={home.owner} className="border p-3 rounded-xl">
      <Link href={`/organization?owner=${home.owner}`}>{home.name}</Link>
      {!home.accepted && <OrganizationForm operation="ec_team_accept" defaults={{ owner: home.owner }} fields={[]} label="قبول الانضمام للفريق" />}
    </div>)}</section>}
    {!org ? <p className="border p-5 rounded-xl">هذه المساحة تحتاج باقة تدعم الفريق أو دعوة فريق مقبولة. <Link href="/pricing">عرض الباقات</Link></p> : <>
      <form className="flex flex-wrap gap-3">
        <input type="hidden" name="owner" value={owner} />
        {business && <label>الفرع<select name="branch" className="field" defaultValue={search.branch ?? ""}><option value="">الجميع</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>}
        <label>المدرب<select name="member" className="field" defaultValue={search.member ?? ""}><option value="">الجميع</option>{members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
        <button className="btn">تصفية</button><Link className="btn" href={`/reports?${filteredParams}`}>التقارير</Link>
      </form>
      <section className="space-y-3"><h2>المتدربون في نطاق صلاحياتك</h2>
        <ul className="grid md:grid-cols-2 gap-3">{org.clients.map(client => <li key={client.id} className="border rounded-xl p-4 space-y-3">
          <strong>{client.name}</strong><p dir="ltr">{client.email}</p>
          <Link className="btn" href={`/organization/${owner}/clients/${client.id}/program`}>عرض وتحرير البرنامج</Link>
          {own && <OrganizationForm operation="ec_assign_client" defaults={{ client: client.id }} fields={[
            { name: "member", label: "المدرب المسؤول", options: members, optional: true },
            ...(business ? [{ name: "branch", label: "الفرع", options: branches, optional: true }] : []),
          ]} label="حفظ الإسناد" />}
        </li>)}</ul>
        {org.clients.length === 50 && <Link className="btn" href={`/organization?${filteredParams}&after=${org.clients.at(-1)!.id}`}>الصفحة التالية</Link>}
      </section>
      {own && <div className="grid md:grid-cols-2 gap-5">
        <section className="border p-5 rounded-xl space-y-4"><h2>دعوة مدرب</h2><p className="text-sm">يلزم حساب مدرب موثق؛ تصبح الدعوة فعالة بعد قبوله. الدعوات المعلقة تشغل مقعدًا.</p>
          <OrganizationForm operation="ec_team_invite" fields={[
            { name: "email_address", label: "البريد", type: "email" },
            { name: "member_role", label: "الدور", options: [{ id: "trainer", name: "مدرب" }, ...(business ? [{ id: "branch_manager", name: "مدير فرع" }] : [])] },
            ...(business ? [{ name: "branch", label: "الفرع", options: branches, optional: true }] : []),
          ]} />
          {org.members.map(member => <div key={member.id}><p>{member.name} · {member.active ? (member.accepted ? "مقبول" : "بانتظار القبول") : "موقوف"}</p>
            {member.active && <OrganizationForm operation="ec_team_deactivate" defaults={{ member: member.id }} fields={[]} label="إيقاف العضو" />}
          </div>)}
        </section>
        {business && <section className="border p-5 rounded-xl space-y-4"><h2>الفروع</h2>
          <OrganizationForm operation="ec_branch_save" fields={[{ name: "branch_name", label: "اسم الفرع" }]} />
          {org.branches.map(branch => <div key={branch.id}><p>{branch.name} · {branch.active ? "نشط" : "مؤرشف"}</p><OrganizationForm operation="ec_branch_save" defaults={{ branch: branch.id, branch_name: branch.name, enabled: !branch.active }} fields={[]} label={branch.active ? "أرشفة الفرع" : "تفعيل الفرع"} /></div>)}
        </section>}
      </div>}
      {business && <>
        <section className="border p-5 rounded-xl space-y-4"><h2>مهمة متابعة جديدة</h2><OrganizationForm operation="ec_task_save" defaults={{ owner }} fields={[
          { name: "client", label: "المتدرب", options: org.clients },
          { name: "assignee", label: "المسؤول", options: [{ id: own ? owner : user.id, name: own ? "المالك" : "أنا" }, ...members] },
          { name: "title", label: "المهمة" }, { name: "due", label: "الموعد بتوقيت جهازك", type: "datetime-local" },
        ]} /></section>
        <section className="space-y-3"><h2>مهام المتابعة في نطاق صلاحياتك</h2>
          <nav className="flex gap-3"><Link href={`/organization?owner=${owner}&task_status=open`}>المفتوحة</Link><Link href={`/organization?owner=${owner}&task_status=done`}>المكتملة</Link></nav>
          {org.tasks.map(task => <div key={task.id} className="border p-4 rounded-xl"><p>{task.title} · {task.status === "done" ? "مكتملة" : "مفتوحة"}</p><OrganizationForm operation="ec_task_save" defaults={{ owner, client: task.client_id, assignee: task.assignee_id, title: task.title, due: task.due_at, task: task.id, done: task.status !== "done" }} fields={[]} label={task.status === "done" ? "إعادة فتح" : "إكمال المهمة"} /></div>)}
          {org.tasks.length === 100 && lastTask && <Link className="btn" href={`/organization?owner=${owner}&task_status=${taskStatus}&task_after=${encodeURIComponent(lastTask.due_at)}&task_id=${lastTask.id}`}>المهام التالية</Link>}
        </section>
      </>}
      {own && org.features.includes("reminders") && <section className="border rounded-xl p-5 space-y-3"><h2>{business ? "أتمتة: حدث ← شرط ← إجراء" : "تذكيرات البريد القابلة للضبط"}</h2>
        <p>البريد يضاف للطابور؛ الإرسال الفعلي غير مفعّل بعد.</p>
        <OrganizationForm operation="ec_rule_save" defaults={business ? {} : { action_name: "email" }} fields={[
          { name: "event_name", label: "الحدث", options: events }, { name: "threshold_value", label: "الحد", type: "number" },
          ...(business ? [{ name: "action_name", label: "الإجراء", options: actions }] : []),
        ]} />
        {org.rules.map(rule => <div key={rule.id}><p>{events.find(event => event.id === rule.event)?.name} ← {rule.threshold} ← {actions.find(action => action.id === rule.action)?.name}</p><OrganizationForm operation="ec_rule_save" defaults={{ rule: rule.id, event_name: rule.event, threshold_value: rule.threshold, action_name: rule.action, enabled: !rule.enabled }} fields={[]} label={rule.enabled ? "إيقاف القاعدة" : "تفعيل القاعدة"} /></div>)}
      </section>}
      {own && business && <>
        <BulkOperations clients={org.clients} members={members} branches={branches} templates={templates} />
        <section className="border rounded-xl p-5 space-y-3"><h2>جدولة تقرير المالك</h2><p>التقارير تحفظ في طابور البريد؛ لم يتوفر مزود إرسال تشغيلي بعد.</p><OrganizationForm operation="ec_schedule_report" fields={[{ name: "first_run", label: "أول موعد بتوقيت جهازك", type: "datetime-local" }, { name: "every_days", label: "يتكرر كل عدد أيام", type: "number" }]} /></section>
        <section><h2>آخر أنشطة الفريق</h2><ul>{org.audit.map(entry => <li key={entry.id}>{entry.action} — {entry.created_at}</li>)}</ul></section>
      </>}
    </>}
  </main>;
}