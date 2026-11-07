import { snapshot } from "@/lib/server";
import { Trainee } from "@/components/trainee";
export default async function MePage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const data = await snapshot();
  return <Trainee data={data} selectedId={(await searchParams).client} />;
}
