export type PixelEvent = { id: string; name: "CompleteRegistration" | "Subscribe"; properties: Record<string,string|number> };
export type TikTokQueue = { page: () => void; track: (name:string,properties:Record<string,string|number>)=>void };
declare global {
 interface Window { ttq?: TikTokQueue; __ecTikTokLoaded?: boolean; __ecTikTokRoute?: string; }
}
export function validPixelId(value: string | undefined) { return value && /^[A-Za-z0-9]{10,64}$/.test(value) ? value : null; }
export function trackRoutePage(state:{ttq?:TikTokQueue;__ecTikTokRoute?:string},route:string){
 if(!state.ttq?.page||state.__ecTikTokRoute===route)return false;
 state.__ecTikTokRoute=route;state.ttq.page();return true;
}
/** Only events claimed from the server enter this queue. Never infer a conversion from a URL. */
export function firePixelEventOnce(event:PixelEvent,queue:TikTokQueue,seen:Set<string>) {
 if(seen.has(event.id))return false;
 // Keep standard conversion names explicit in the shipped browser code.
 // Only the server's new-account receipt can reach this registration branch.
 if(event.name==="CompleteRegistration"){
  queue.track("CompleteRegistration", { content_name: "EasyCoach signup" });
 }else if(event.name==="Subscribe"){
  queue.track("Subscribe",event.properties);
 }else return false;
 // A failed queue call must not suppress a later attempt in this page.
 seen.add(event.id);
 return true;
}
export function pixelBaseCode(id:string) {
 return `if(!window.__ecTikTokLoaded){
!function (w, d, t) {
  w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var s=d.createElement("script");s.type="text/javascript",s.async=!0,s.src=r+"?sdkid="+e+"&lib="+t;var a=d.getElementsByTagName("script")[0];a.parentNode.insertBefore(s,a)};
  ttq.load(${JSON.stringify(id)});
  ttq.page();
}(window, document, 'ttq');
window.__ecTikTokLoaded=true;
window.__ecTikTokRoute=window.location.pathname+window.location.search;
}`;
}
