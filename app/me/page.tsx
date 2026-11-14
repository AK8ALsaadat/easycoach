import { snapshot } from "@/lib/server";
import { paylinkReadyCoaches } from "@/lib/paylink/service";
import { Trainee } from "@/components/trainee";
import { redirect } from "next/navigation";
export default async function MePage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const data = await snapshot();
  const selectedId = (await searchParams).client;
  if (data.profile?.role === "coach" && selectedId) redirect(`/coach/clients/${encodeURIComponent(selectedId)}/preview`);
  const coachIds = data.clients.filter((c) => c.trainee_user_id === data.profile?.id && !c.archived).map((c) => c.coach_id);
  const paylinkCoaches = await paylinkReadyCoaches(coachIds);
  return <Trainee data={data} selectedId={selectedId} paylinkCoaches={paylinkCoaches} />;
}
