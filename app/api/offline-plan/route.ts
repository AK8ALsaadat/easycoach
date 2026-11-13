import { NextResponse } from "next/server";
import { actor, rpc } from "@/lib/server";
import type { Snapshot } from "@/lib/model";
import { offlinePlan } from "@/lib/offline-plan";

// Read by the service worker (network first) so the trainee can see today's
// workout without internet at the gym. 401/403 make the worker drop its copy.
export async function GET() {
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
  const user = await actor();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers });
  const data = await rpc<Snapshot>("management_snapshot");
  if (!data.profile || data.profile.role === "coach") return NextResponse.json({ error: "forbidden" }, { status: 403, headers });
  data.coach_branding = await rpc<NonNullable<Snapshot["coach_branding"]>>("coach_branding_snapshot").catch(() => []);
  return NextResponse.json(offlinePlan(data), { headers });
}
