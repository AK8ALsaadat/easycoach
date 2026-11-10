import { redirect, notFound } from "next/navigation";
import { snapshot, localMode } from "@/lib/server";
import { Workspace } from "@/components/workspace";
export default async function CoachPage({
  params,
  searchParams,
}: {
  params: Promise<{ path?: string[] }>;
  searchParams: Promise<{
    filter?: string;
    add?: string;
    q?: string;
    tab?: string;
  }>;
}) {
  const data = await snapshot();
  if (data.profile?.role !== "coach") redirect("/me");
  const { path = [] } = await params;
  const search = await searchParams;
  const section = path[0] ?? "today";
  const editing = section === "clients" && path.length === 3 && path[2] === "edit";
  if (
    !["today", "clients", "library", "finance", "settings"].includes(section) ||
    path.length > 3 ||
    (path.length === 3 && !editing) ||
    (path.length >= 2 && section !== "clients")
  )
    notFound();
  return (
    <Workspace
      data={data}
      section={section}
      clientId={path[1]}
      initialFilter={
        search.filter ?? (search.add ? "add" : "")
      }
      initialTab={editing ? search.tab === "nutrition" ? "nutrition" : "program" : search.tab ?? "overview"}
      initialQuery={search.q ?? ""}
      appUrl={process.env.APP_URL ?? "http://127.0.0.1:3200"}
      local={localMode()}
    />
  );
}
