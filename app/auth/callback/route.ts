import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabase, localMode, safeNext } from "@/lib/server";
import { attachGoogleAttribution } from "@/lib/analytics/server";
import { completeSignupTrial } from "@/lib/platform/onboarding";
import { POLICY_VERSION } from "@/lib/legal";

const OAUTH_ROLE_COOKIE = "ec_oauth_role";

export async function GET(request: NextRequest) {
  if (localMode()) return NextResponse.redirect(new URL("/login", request.url));
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const jar = await cookies();
  const requestedRole = jar.get(OAUTH_ROLE_COOKIE)?.value;
  const requestedTrial = jar.get("ec_oauth_trial")?.value === POLICY_VERSION;
  jar.delete({ name: "ec_oauth_trial", path: "/auth/callback" });
  jar.delete({ name: OAUTH_ROLE_COOKIE, path: "/auth/callback" });
  // Provider errors (e.g. the user cancelled Google) arrive without a code.
  if (!code && params.get("error"))
    return NextResponse.redirect(new URL("/login?error=oauth", request.url));
  if (code) {
    const client = await supabase();
    const { data, error } = await client.auth.exchangeCodeForSession(code);
    if (!error) {
      if(data.user?.id)await attachGoogleAttribution(data.user.id);
      const meta = data.user?.user_metadata ?? {};
      // Google accounts arrive without our role/display name. Set them once, for new
      // accounts only; the profile row is created from these on first snapshot.
      if (data.user && !meta.role) {
        const role = requestedRole === "coach" ? "coach" : "trainee";
        const name = String(meta.display_name ?? meta.full_name ?? meta.name ?? "").trim().slice(0, 120);
        await client.auth.updateUser({ data: { role, ...(name.length >= 2 && !meta.display_name ? { display_name: name } : {}), ...(requestedTrial && role === "coach" ? { ec_signup_trial: true, policy_version: POLICY_VERSION, policy_accepted_at: new Date().toISOString() } : {}) } });
        if (requestedTrial && role === "coach") return NextResponse.redirect(new URL(await completeSignupTrial(role, safeNext(params.get("next")), true), request.url));
        // A brand-new coach picks a plan (free trial) first; invites and explicit targets win.
        if (role === "coach" && safeNext(params.get("next")) === "/coach") return NextResponse.redirect(new URL("/start", request.url));
      }
      if (meta.role === "coach" && (requestedTrial || meta.ec_signup_trial === true)) return NextResponse.redirect(new URL(await completeSignupTrial("coach", safeNext(params.get("next")), true), request.url));
      return NextResponse.redirect(new URL(safeNext(params.get("next")), request.url));
    }
  }
  return NextResponse.redirect(new URL("/login?error=confirmation", request.url));
}
