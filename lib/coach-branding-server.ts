import "server-only";
import { hash, rpc } from "./server";
import type { CoachBranding } from "./coach-branding";

export async function linkBranding(token: string, kind: string) {
  if (!/^[a-f0-9]{64}$/.test(token) || !["p", "invite", "join"].includes(kind)) return null;
  return rpc<CoachBranding | null>("coach_branding_link", { token_hash: hash(token), link_type: kind }, true);
}
