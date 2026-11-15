import {expect,it,vi} from "vitest";
vi.mock("@/lib/runtime",()=>({localPreview:()=>true}));
import {NextRequest} from "next/server";
import {proxy} from "@/proxy";
import {ATTRIBUTION_COOKIE,ATTRIBUTION_SECONDS,readAttributionCookie} from "@/lib/analytics/attribution";
it("sets a first-party HttpOnly 30-day attribution cookie and never overwrites the first visit",async()=>{
 const first=await proxy(new NextRequest("https://easycoach.space/pricing?utm_source=tiktok&utm_campaign=first&ttclid=click123"));
 const cookie=first.cookies.get(ATTRIBUTION_COOKIE)!;
 expect(readAttributionCookie(cookie.value)).toEqual({utm_source:"tiktok",utm_campaign:"first",ttclid:"click123"});
 expect(first.headers.get("set-cookie")).toContain(`Max-Age=${ATTRIBUTION_SECONDS}`);expect(first.headers.get("set-cookie")).toContain("HttpOnly");
 const again=new NextRequest("https://easycoach.space/pricing?utm_campaign=later");again.cookies.set(ATTRIBUTION_COOKIE,cookie.value);
 expect((await proxy(again)).cookies.has(ATTRIBUTION_COOKIE)).toBe(false);
});
it("does not set attribution cookies on API or asset requests",async()=>{
 for(const path of ["/api/analytics/events","/icons/icon.png"]){expect((await proxy(new NextRequest("https://easycoach.space"+path))).cookies.has(ATTRIBUTION_COOKIE)).toBe(false);}
});
