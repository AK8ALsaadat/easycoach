"use client";
import Script from "next/script";
import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { firePixelEventOnce, pixelBaseCode, validPixelId, trackRoutePage, type PixelEvent } from "@/lib/analytics/tiktok";

const seen = new Set<string>();
let inFlight: Promise<void> | null = null;
let resyncRequested=false;
function syncEvents() {
 if (!window.__ecTikTokLoaded || !window.ttq?.track || document.visibilityState === "hidden") return;
 if(inFlight){resyncRequested=true;return;}
 // Do not abort on a React remount: a claimed response must still reach the queue.
 inFlight=fetch("/api/analytics/events",{method:"POST",credentials:"same-origin",cache:"no-store"})
  .then(async response=>{
   if(!response.ok)return;
   const data=await response.json() as {events:PixelEvent[]};
   for(const event of data.events??[]) if(window.ttq)firePixelEventOnce(event,window.ttq,seen);
  }).catch(()=>{}).finally(()=>{inFlight=null;if(resyncRequested){resyncRequested=false;syncEvents();}});
}
function page() {
 if(!window.__ecTikTokLoaded || !window.ttq?.page)return;
 const route=window.location.pathname+window.location.search;
 trackRoutePage(window,route);
 void syncEvents();
}
function Pixel({id}:{id:string}) {
 const pathname=usePathname(),search=useSearchParams().toString();
 useEffect(()=>{page();},[pathname,search]);
 useEffect(()=>{
  const timer=setInterval(syncEvents,30000);
  document.addEventListener("visibilitychange",syncEvents);
  return()=>{clearInterval(timer);document.removeEventListener("visibilitychange",syncEvents);};
 },[]);
 return <Script id="easycoach-tiktok-pixel" strategy="afterInteractive" onReady={page}>{pixelBaseCode(id)}</Script>;
}
export function TikTokPixel() {
 const id=validPixelId(process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID);
 return id?<Suspense fallback={null}><Pixel id={id}/></Suspense>:null;
}
