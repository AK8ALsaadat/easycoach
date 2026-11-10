"use client";
import {useEffect} from "react";
import {useLocale} from "./locale-provider";

export function useUnsavedChanges(dirty:boolean) {
  const {t:tr}=useLocale();
  useEffect(()=>{
    if(!dirty)return;
    const unload=(event:BeforeUnloadEvent)=>event.preventDefault();
    const navigate=(event:MouseEvent)=>{
      if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||!(event.target instanceof Element))return;
      const link=event.target.closest('a[href]');
      if(!(link instanceof HTMLAnchorElement)||link.target==='_blank'||link.hasAttribute('download'))return;
      const url=new URL(link.href,window.location.href);
      if(url.origin!==window.location.origin||(url.pathname===window.location.pathname&&url.search===window.location.search))return;
      if(!window.confirm(tr("لديك تعديلات لم تُحفظ بعد. هل تريد المغادرة دون حفظها؟"))){event.preventDefault();event.stopPropagation();}
    };
    window.addEventListener('beforeunload',unload);document.addEventListener('click',navigate,true);
    return ()=>{window.removeEventListener('beforeunload',unload);document.removeEventListener('click',navigate,true);};
  },[dirty,tr]);
}
