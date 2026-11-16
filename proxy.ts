import { billingEnabled } from "@/lib/billing-mode";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/supabase";
import { localPreview } from "@/lib/runtime";
import { ATTRIBUTION_COOKIE,ATTRIBUTION_SECONDS,attributionCookieValue,attributionFromUrl } from "@/lib/analytics/attribution";
/** Static assets whose responses never depend on the Supabase session. */
const PUBLIC_FILE = /\.(?:png|jpe?g|svg|gif|webp|avif|ico|txt|xml|webmanifest|js|css|map|woff2?)$/i;
export async function proxy(request: NextRequest) {
  if (!billingEnabled()) {
    const path = request.nextUrl.pathname;
    if (/^\/(subscription|start|payments\/paylink)(\/|$)/.test(path))
      return NextResponse.redirect(new URL("/", request.url));
    if (/^\/api\/(platform\/(checkout|coupon)|payments\/|health\/payments)/.test(path))
      return new NextResponse(null, { status: 404 });
  }
  let firstTouch:string|null=null;
  if(!PUBLIC_FILE.test(request.nextUrl.pathname)&&!request.nextUrl.pathname.startsWith('/api/')&&!request.nextUrl.pathname.startsWith('/_next/')&&!request.cookies.has(ATTRIBUTION_COOKIE)){
    firstTouch=attributionCookieValue(attributionFromUrl(request.nextUrl.searchParams));
    request.cookies.set(ATTRIBUTION_COOKIE,firstTouch);
  }
  const finish=(value:NextResponse)=>{
    if(firstTouch!==null)value.cookies.set(ATTRIBUTION_COOKIE,firstTouch,{httpOnly:true,secure:request.nextUrl.protocol==='https:',sameSite:'lax',path:'/',maxAge:ATTRIBUTION_SECONDS});
    return value;
  };
  let response = NextResponse.next({ request });
  if (localPreview()) return finish(response);
  // getUser() is a network call per request; it only matters when a session
  // cookie exists and the response is a page, so assets and visitors skip it.
  if (PUBLIC_FILE.test(request.nextUrl.pathname)) return finish(response);
  if (!request.cookies.getAll().some((cookie) => cookie.name.startsWith("sb-")))
    return finish(response);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return finish(response);
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
            secure: process.env.NODE_ENV === "production" || (process.env.APP_URL?.startsWith("https://") ?? false),
          }),
        );
      },
    },
  });
  await client.auth.getUser();
  return finish(response);
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
