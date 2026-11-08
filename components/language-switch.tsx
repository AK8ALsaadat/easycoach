"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { useLocale } from "./locale-provider";
import { changeLanguage } from "@/app/language-actions";
export function LanguageSwitch() {
  const { language } = useLocale(),
    router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn-secondary language-switch"
      aria-label={
        language === "ar" ? "Switch to English" : "التبديل إلى العربية"
      }
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await changeLanguage(language === "ar" ? "en" : "ar");
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      <Languages size={17} />
      <span>{language === "ar" ? "EN" : "العربية"}</span>
    </button>
  );
}
