import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabase, localMode, safeNext } from "@/lib/server";

const OAUTH_ROLE_COOKIE = "ec_oauth_role";

export async function GET(request: NextRequest) {
  if (localMode()) return NextResponse.redirect(new URL("/login", request.url));
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const jar = await cookies();
  const requestedRole = jar.get(OAUTH_ROLE_COOKIE)?.value;
  jar.delete({ name: OAUTH_ROLE_COOKIE, path: "/auth/callback" });
  // Provider errors (e.g. the user cancelled Google) arrive without a code.
  if (!code && params.get("error"))
    return NextResponse.redirect(new URL("/login?error=oauth", request.url));
  if (code) {
    const client = await supabase();
    const { data, error } = await client.auth.exchangeCodeForSession(code);
    if (!error) {
      const meta = data.user?.user_metadata ?? {};
      // Google accounts arrive without our role/display name. Set them once, for new
      // accounts only; the profile row is created from these on first snapshot.
      if (data.user && !meta.role) {
        const role = requestedRole === "coach" ? "coach" : "trainee";
        const name = String(meta.display_name ?? meta.full_name ?? meta.name ?? "").trim().slice(0, 120);
        await client.auth.updateUser({ data: { role, ...(name.length >= 2 && !meta.display_name ? { display_name: name } : {}) } });
        // A brand-new coach picks a plan (free trial) first; invites and explicit targets win.
        if (role === "coach" && safeNext(params.get("next")) === "/coach") return NextResponse.redirect(new URL("/start", request.url));
      }
      return NextResponse.redirect(new URL(safeNext(params.get("next")), request.url));
    }
  }
  return NextResponse.redirect(new URL("/login?error=confirmation", request.url));
}
