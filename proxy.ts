import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/supabase";
import { localPreview } from "@/lib/runtime";
/** Static assets whose responses never depend on the Supabase session. */
const PUBLIC_FILE = /\.(?:png|jpe?g|svg|gif|webp|avif|ico|txt|xml|webmanifest|js|css|map|woff2?)$/i;
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (localPreview()) return response;
  // getUser() is a network call per request; it only matters when a session
  // cookie exists and the response is a page, so assets and visitors skip it.
  if (PUBLIC_FILE.test(request.nextUrl.pathname)) return response;
  if (!request.cookies.getAll().some((cookie) => cookie.name.startsWith("sb-")))
    return response;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;
  const client = createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(items) {
        items.forEach((c) => request.cookies.set(c.name, c.value));
        response = NextResponse.next({ request });
        items.forEach((c) =>
          response.cookies.set(c.name, c.value, {
            ...c.options,
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.APP_URL?.startsWith("https://") ?? false,
          }),
        );
      },
    },
  });
  await client.auth.getUser();
  return response;
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
