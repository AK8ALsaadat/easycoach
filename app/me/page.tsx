import { snapshot } from "@/lib/server";
import { paylinkReadyCoaches } from "@/lib/paylink/service";
import { Trainee } from "@/components/trainee";
export default async function MePage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const data = await snapshot();
  const coachIds = data.clients.filter((c) => c.trainee_user_id === data.profile?.id && !c.archived).map((c) => c.coach_id);
  const paylinkCoaches = await paylinkReadyCoaches(coachIds);
  return <Trainee data={data} selectedId={(await searchParams).client} paylinkCoaches={paylinkCoaches} />;
}
