import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";
import { cookies } from "next/headers";
import { LocaleProvider } from "@/components/locale-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { PwaManager } from "@/components/pwa-manager";
import { FormValidation } from "@/components/form-validation";
import { PWA_THEME } from "@/lib/pwa";
const font = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});
export const metadata: Metadata = {
  title: { default: "إيزي كوتش", template: "%s | إيزي كوتش" },
  description:
    "مساحة عربية لإدارة المتدربين والبرامج والاشتراكات للمدربين الشخصيين.",
  robots: { index: false, follow: false },
  applicationName: "إيزي كوتش",
  appleWebApp: { capable: true, title: "إيزي كوتش", statusBarStyle: "black-translucent" },
  icons: { apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }] },
  // Next emits the generic tag; older iOS versions still read the Apple-prefixed one.
  other: { "apple-mobile-web-app-capable": "yes" },
};
// The browser chrome follows the chosen theme (light by default); viewport-fit
// exposes the safe-area insets used by the bottom navigation.
export async function generateViewport(): Promise<Viewport> {
  const dark = (await cookies()).get("ec_theme")?.value === "dark";
  return { themeColor: dark ? PWA_THEME.dark : PWA_THEME.light, viewportFit: "cover", width: "device-width", initialScale: 1 };
}
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const preferences=await cookies();
  const language = preferences.get("ec_language")?.value === "en" ? "en" : "ar";
  // Light is the first-visit default; keep an explicit dark-mode choice.
  const theme=preferences.get("ec_theme")?.value === "dark" ? "dark" : "light";
  return (
    <html lang={language} dir={language === "en" ? "ltr" : "rtl"} data-theme={theme}>
      <body className={font.className}>
        <LocaleProvider language={language}><ThemeProvider initialTheme={theme}>{children}<PwaManager /><FormValidation /></ThemeProvider></LocaleProvider>
      </body>
    </html>
  );
}
