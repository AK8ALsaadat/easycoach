import { redirect, notFound } from "next/navigation";
import { snapshot, localMode } from "@/lib/server";
import { Workspace } from "@/components/workspace";
export default async function CoachPage({
  params,
  searchParams,
}: {
  params: Promise<{ path?: string[] }>;
  searchParams: Promise<{ filter?: string; add?: string }>;
}) {
  const data = await snapshot();
  if (data.profile?.role !== "coach") redirect("/me");
  const { path = [] } = await params;
  const section = path[0] ?? "today";
  if (
    !["today", "clients", "library", "finance", "settings"].includes(section) ||
    path.length > 2 ||
    (path.length === 2 && section !== "clients")
  )
    notFound();
  return (
    <Workspace
      data={data}
      section={section}
      clientId={path[1]}
      initialFilter={
        (await searchParams).filter ?? ((await searchParams).add ? "add" : "")
      }
      appUrl={process.env.APP_URL ?? "http://127.0.0.1:3200"}
      local={localMode()}
    />
  );
}
