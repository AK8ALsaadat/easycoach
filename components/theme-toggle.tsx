"use client";
import {Moon,Sun} from "lucide-react";
import {useTheme} from "./theme-provider";
import {useLocale} from "./locale-provider";

export function ThemeToggle(){
  const {theme,toggle}=useTheme();const {t:tr}=useLocale();const label=tr(theme==="dark"?"تفعيل الوضع الفاتح":"تفعيل الوضع الداكن");
  return <button type="button" className="btn-secondary theme-toggle" aria-label={label} title={label} aria-pressed={theme==="dark"} onClick={toggle}>{theme==="dark"?<Sun size={18}/>:<Moon size={18}/>}</button>;
}
