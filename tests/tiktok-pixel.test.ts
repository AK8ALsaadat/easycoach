import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {afterEach,expect,it,vi} from "vitest";
vi.mock("next/navigation",()=>({usePathname:()=>"/pricing",useSearchParams:()=>new URLSearchParams()}));
vi.mock("next/script",()=>({default:({id,strategy,children}:{id:string;strategy:string;children:string})=>createElement("script",{id,"data-strategy":strategy},children)}));
import {TikTokPixel} from "@/components/TikTokPixel";
import {firePixelEventOnce,pixelBaseCode,trackRoutePage} from "@/lib/analytics/tiktok";
import {attributionCookieValue,readAttributionCookie,attributionFromUrl} from "@/lib/analytics/attribution";
afterEach(()=>vi.unstubAllEnvs());
it("renders no script when the public pixel ID is missing",()=>{
 vi.stubEnv("NEXT_PUBLIC_TIKTOK_PIXEL_ID","");expect(renderToStaticMarkup(createElement(TikTokPixel))).toBe("");
});
it("uses one stable afterInteractive script and initializes the official deferred page queue",()=>{
 vi.stubEnv("NEXT_PUBLIC_TIKTOK_PIXEL_ID","FICTIONALPIXEL1234567");
 const html=renderToStaticMarkup(createElement(TikTokPixel));expect(html).toContain('data-strategy="afterInteractive"');expect(html).toContain('easycoach-tiktok-pixel');
 const code=pixelBaseCode("FICTIONALPIXEL1234567");expect(code).toContain("__ecTikTokLoaded");expect(code).toContain("ttq.page()");expect(code).toContain("analytics.tiktok.com/i18n/pixel/events.js");
});
it("CompleteRegistration is sent once for a server-issued new-account event, not when the same event reappears",()=>{
 const queue={page:vi.fn(),track:vi.fn()},seen=new Set<string>();
 const event={id:"new-account-event",name:"CompleteRegistration" as const,properties:{content_name:"EasyCoach signup"}};
 expect(firePixelEventOnce(event,queue,seen)).toBe(true);expect(firePixelEventOnce(event,queue,seen)).toBe(false);
 expect(queue.track).toHaveBeenCalledExactlyOnceWith("CompleteRegistration",{content_name:"EasyCoach signup"});
});
it("fires once per SPA route/query change, including navigating back, without repeating the initial page",()=>{
 const state={ttq:{page:vi.fn(),track:vi.fn()},__ecTikTokRoute:"/pricing"};
 expect(trackRoutePage(state,"/pricing")).toBe(false);expect(trackRoutePage(state,"/terms")).toBe(true);expect(trackRoutePage(state,"/terms")).toBe(false);
 expect(trackRoutePage(state,"/pricing")).toBe(true);expect(trackRoutePage(state,"/pricing?plan=pro")).toBe(true);expect(state.ttq.page).toHaveBeenCalledTimes(3);
});
it("captures only bounded first-touch fields, without arbitrary URL data or tokens",()=>{
 const data=attributionFromUrl(new URLSearchParams("utm_source=tiktok&utm_campaign=launch&ttclid=click_123&token=private&email=private"));
 expect(readAttributionCookie(attributionCookieValue(data))).toEqual({utm_source:"tiktok",utm_campaign:"launch",ttclid:"click_123"});
 expect(readAttributionCookie("invalid")).toEqual({});expect(attributionFromUrl(new URLSearchParams("ttclid=bad%3Cvalue%3E"))).toEqual({ttclid:"badvalue"});
});
