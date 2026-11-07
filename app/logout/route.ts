import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { hash, localMode, supabase } from "@/lib/server";
import { getLocalDatabase } from "@/lib/local-db";
export async function GET() {
  return NextResponse.json(
    { message: "استخدم زر الخروج (POST محمي)" },
    { status: 405, headers: { Allow: "POST" } },
  );
}
export async function POST(request: NextRequest) {
  const allowed = [
    process.env.APP_URL,
    ...(localMode() ? ["http://127.0.0.1:3200", "http://localhost:3200"] : []),
  ];
  if (!allowed.includes(request.headers.get("origin") ?? ""))
    return new NextResponse("Forbidden", { status: 403 });
  if (localMode()) {
    const jar = await cookies();
    const token = jar.get("ec_session")?.value;
    if (token)
      await (
        await getLocalDatabase()
      ).query("delete from private.local_sessions where token_hash=$1", [
        hash(token),
      ]);
    jar.delete("ec_session");
  } else await (await supabase()).auth.signOut({ scope: "local" });
  return NextResponse.redirect(new URL("/login", request.url), 303);
}
