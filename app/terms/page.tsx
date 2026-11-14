import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { termsSections } from "@/lib/legal";
export const metadata: Metadata = { title: "الشروط والأحكام" };
export default function Terms() {
  return <LegalPage title="الشروط والأحكام" lead="شروط استخدام المنصة والباقات والتجربة المجانية والدفع والإلغاء وحقوقك." sections={termsSections} />;
}
