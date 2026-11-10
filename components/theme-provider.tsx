"use client";
import {createContext,useContext,useState,type ReactNode} from "react";
type Theme="light"|"dark";
const ThemeContext=createContext({theme:"light" as Theme,toggle:()=>{}});

export function ThemeProvider({initialTheme,children}:{initialTheme:Theme;children:ReactNode}) {
  const [theme,setTheme]=useState(initialTheme);
  function toggle(){
    const next=theme==="dark"?"light":"dark";
    document.documentElement.dataset.theme=next;
    document.cookie=`ec_theme=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol==="https:"?"; Secure":""}`;
    setTheme(next);
  }
  return <ThemeContext.Provider value={{theme,toggle}}>{children}</ThemeContext.Provider>;
}
export const useTheme=()=>useContext(ThemeContext);
