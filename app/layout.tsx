import type { Metadata } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";
import { cookies } from "next/headers";
import { LocaleProvider } from "@/components/locale-provider";
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
  const language =
    (await cookies()).get("ec_language")?.value === "en" ? "en" : "ar";
  return (
    <html lang={language} dir={language === "en" ? "ltr" : "rtl"}>
      <body className={font.className}>
        <LocaleProvider language={language}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
