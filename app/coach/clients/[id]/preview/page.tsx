import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { requireCoach } from "@/lib/server";
import { effectiveNutrition } from "@/lib/management";
import { ProgramView } from "@/components/program-view";
import { CoachIdentity } from "@/components/coach-identity";
import { translator } from "@/lib/i18n";

export default async function TraineePreview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await requireCoach();
  const client = data.clients.find(row => row.id === id && row.coach_id === data.profile!.id && !row.archived);
  if (!client) notFound();
  const tr = translator((await cookies()).get("ec_language")?.value === "en" ? "en" : "ar");
  const program = data.programs.find(row => row.client_id === id && row.published_at);
  const nutrition = effectiveNutrition(data.management?.records ?? [], id, program?.published_at);
  return <main className="trainee-shell mx-auto max-w-5xl px-4 py-8">
    <header className="card mb-6 p-5"><h1>{tr("معاينة كمتدرب")} · {client.name}</h1><p className="mt-3 text-muted">{tr("معاينة للقراءة فقط. تعرض النسخة المنشورة؛ تعديلات المسودة لا تظهر هنا.")}</p><Link className="btn-secondary mt-4" href={`/coach/clients/${id}/edit`}>{tr("العودة للمحرر")}</Link></header>
    <CoachIdentity branding={data.coach_branding?.find(row => row.coach_id === client.coach_id)}/>
    <ProgramView program={program} nutrition={nutrition}/>
  </main>;
}
