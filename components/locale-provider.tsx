"use client";
import { createContext, useContext, useMemo } from "react";
import { translator, type Language } from "@/lib/i18n";
const Context = createContext({
  language: "ar" as Language,
  t: translator("ar"),
});
export function LocaleProvider({
  language,
  children,
}: {
  language: Language;
  children: React.ReactNode;
}) {
  const value = useMemo(
    () => ({ language, t: translator(language) }),
    [language],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useLocale = () => useContext(Context);
