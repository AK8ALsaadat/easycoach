import type { Metadata } from "next";
export const metadata: Metadata = {
  referrer: "no-referrer",
  robots: { index: false, follow: false, noarchive: true },
};
export default function UploadLayout({ children }: { children: React.ReactNode }) {
  return children;
}
