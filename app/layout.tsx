import type { Metadata } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";
import { cookies } from "next/headers";
import { LocaleProvider } from "@/components/locale-provider";
import { ThemeProvider } from "@/components/theme-provider";
const font = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});
export const metadata: Metadata = {
  title: { default: "إيزي كوتش", template: "%s | إيزي كوتش" },
  description:
    "مساحة عربية لإدارة العملاء والبرامج والاشتراكات للمدربين الشخصيين.",
  robots: { index: false, follow: false },
};
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const preferences=await cookies();
  const language = preferences.get("ec_language")?.value === "en" ? "en" : "ar";
  const theme=preferences.get("ec_theme")?.value === "dark" ? "dark" : "light";
  return (
    <html lang={language} dir={language === "en" ? "ltr" : "rtl"} data-theme={theme}>
      <body className={font.className}>
        <LocaleProvider language={language}><ThemeProvider initialTheme={theme}>{children}</ThemeProvider></LocaleProvider>
      </body>
    </html>
  );
}
