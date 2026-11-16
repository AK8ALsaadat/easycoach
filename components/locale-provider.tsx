"use client";
import { createContext, useContext, useMemo } from "react";
import { createTranslator, type Language } from "@/lib/translate";
const Context = createContext({
  language: "ar" as Language,
  t: createTranslator("ar"),
});
export function LocaleProvider({
  language,
  dictionary,
  children,
}: {
  language: Language;
  dictionary?: Record<string, string>;
  children: React.ReactNode;
}) {
  const value = useMemo(
    () => ({ language, t: createTranslator(language, dictionary) }),
    [language, dictionary],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useLocale = () => useContext(Context);
