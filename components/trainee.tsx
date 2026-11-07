"use client";
import Link from "next/link";
import { useState } from "react";
import { Download, LogOut, Shield, Wallet } from "lucide-react";
import { logoutAction,mutate } from "@/app/actions";
import {useRouter} from 'next/navigation';
import {WeightPanel} from './weight-panel';
import type { Snapshot } from "@/lib/model";
import { formatDate, money, riyadhToday } from "@/lib/dates";
import { Brand } from "./brand";
import { DataForm } from "./forms";
import { ProgramView } from "./program-view";
export function Trainee({
  data,
  selectedId,
}: {
  data: Snapshot;
  selectedId?: string;
}) {
  const router=useRouter();
  const clients = data.clients.filter(
    (c) => c.trainee_user_id === data.profile?.id && !c.archived,
  );
  const [clientId, setClientId] = useState(
    selectedId && clients.some((c) => c.id === selectedId)
      ? selectedId
      : (clients[0]?.id ?? ""),
  );
  const client = clients.find((c) => c.id === clientId);
  const subscriptions = data.subscriptions.filter(
    (s) => s.client_id === clientId,
  );
  const today = riyadhToday();
  const current =
    subscriptions.find((s) => s.start_date <= today && s.end_date >= today) ??
    subscriptions[0];
  const paid = current
    ? data.payments
        .filter((p) => p.subscription_id === current.id)
        .reduce((n, p) => n + Number(p.amount), 0)
    : 0;
  return (
    <div className="min-h-screen">
      <header className="border-b bg-white px-5 py-5">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <Brand />
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted">
              أهلًا، {data.profile!.name}
            </span>
            <form action={logoutAction}>
              <button className="btn-secondary">
                <LogOut size={15} />
                خروج
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-9">
        <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-xs text-teal">مساحتك مع مدربك</p>
            <h1>برنامجك، بوضوح.</h1>
            <p className="mt-2 text-sm text-muted">
              جدولك، وجباتك، وتقدمك مع مدربك.
            </p>
          </div>
          <a download href="/api/export" className="btn-secondary">
            <Download size={15} />
            تصدير بياناتي
          </a>
        </div>
        {!client ? (
          <div className="card empty">
            <Shield size={30} className="text-teal" />
            <h2>حسابك جاهز، وينتظر ربطه بمدربك</h2>
            <p>
              افتح دعوة مدربك وأنت داخل بنفس الإيميل الموثّق. طلب الانضمام وحده
              لا يمنح الوصول.
            </p>
            {data.profile?.role === "coach" ? (
              <Link href="/coach" className="btn">
                لوحة المدرب
              </Link>
            ) : null}
          </div>
        ) : (
          <>
            {clients.length > 1 ? (
              <div className="mb-5">
                <label htmlFor="portal-client">اختر اشتراكك مع المدرب</label>
                <select
                  id="portal-client"
                  className="field max-w-md"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                >
                  {clients.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.name} · {c.coach_id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(290px,1fr)]">
              <ProgramView
                program={data.programs.find(
                  (p) => p.client_id === clientId && p.published_at,
                )}
              />
              <aside className="space-y-6">
                <WeightPanel entries={(data.weights??[]).filter(w=>w.client_id===clientId)} target={data.client_goals?.find(g=>g.client_id===clientId)?.target_weight} onSave={async(day,weight)=>{const r=await mutate('weight_save',{client_id:clientId,entry_date:day,weight});if(r.ok)router.refresh();else return r.message}} onDelete={async day=>{const r=await mutate('weight_delete',{client_id:clientId,entry_date:day});if(r.ok)router.refresh();else return r.message}}/>
                <section className="card p-6">
                  <h2 className="flex items-center gap-2">
                    <Wallet size={18} className="text-teal" />
                    اشتراكك
                  </h2>
                  {current ? (
                    <>
                      <h3 className="mt-5 text-lg font-semibold">
                        {current.name}
                      </h3>
                      <p className="mt-3 text-sm text-muted">
                        {formatDate(current.start_date)} —{" "}
                        {formatDate(current.end_date)}
                      </p>
                      <div className="mt-5 space-y-3 border-t pt-4 text-sm">
                        <p className="flex justify-between">
                          <span className="text-muted">قيمة الباقة</span>
                          <span>{money(current.price)}</span>
                        </p>
                        <p className="flex justify-between">
                          <span className="text-muted">المدفوع</span>
                          <span>{money(paid)}</span>
                        </p>
                        <p className="flex justify-between font-semibold">
                          <span>المتبقي</span>
                          <span>{money(Number(current.price) - paid)}</span>
                        </p>
                      </div>
                      {data.freezes
                        .filter((f) => f.subscription_id === current.id)
                        .map((f) => (
                          <p
                            className="mt-3 rounded-xl bg-canvas p-3 text-xs text-muted"
                            key={f.id}
                          >
                            تجميد {formatDate(f.start_date)} —{" "}
                            {formatDate(f.end_date)}. طُبّق تمديد {f.days}{" "}
                            يومًا.
                          </p>
                        ))}
                      <p className="mt-5 text-xs text-muted">
                        لأي تعديل أو تجديد، تواصل مع مدربك. سجل الدفعات ليس
                        فاتورة ضريبية.
                      </p>
                    </>
                  ) : (
                    <p className="mt-4 text-sm text-muted">
                      لم يضف مدربك باقة بعد.
                    </p>
                  )}
                </section>
                <details className="card p-6">
                  <summary>طلب تصحيح أو حذف بياناتي</summary>
                  <p className="my-4 text-xs leading-7 text-muted">
                    يصل الطلب لمدربك للمراجعة والتنفيذ. لا تكتب بيانات طبية في
                    الطلب.
                  </p>
                  <DataForm
                    key={clientId}
                    command="privacy_request"
                    base={{ client_id: clientId }}
                    fields={[
                      {
                        name: "kind",
                        label: "نوع الطلب",
                        type: "select",
                        options: [
                          { value: "correction", label: "تصحيح بيانات" },
                          {
                            value: "deletion",
                            label: "حذف بياناتي وإلغاء الوصول",
                          },
                        ],
                      },
                      {
                        name: "details",
                        label: "تفاصيل الطلب",
                        type: "textarea",
                        required: true,
                      },
                    ]}
                    label="إرسال الطلب للمدرب"
                  />
                  {data.privacy_requests
                    .filter((r) => r.client_id === clientId)
                    .map((r) => (
                      <p
                        className="mt-4 border-t pt-3 text-xs text-muted"
                        key={r.id}
                      >
                        {r.kind === "deletion" ? "حذف" : "تصحيح"} ·{" "}
                        {r.status === "fulfilled"
                          ? "تمت المعالجة"
                          : "ينتظر المراجعة"}
                        {r.resolution ? " · " + r.resolution : ""}
                      </p>
                    ))}
                </details>
              </aside>
            </div>
          </>
        )}
      </main>
      <footer className="mx-auto max-w-6xl border-t px-5 py-6 text-xs text-muted">
        <Link href="/privacy" className="underline">
          الخصوصية
        </Link>{" "}
        · جميع التواريخ بتوقيت الرياض
      </footer>
    </div>
  );
}
