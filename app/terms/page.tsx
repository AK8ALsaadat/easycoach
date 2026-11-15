import { billingEnabled } from "@/lib/billing-mode";
import { freeTermsSections } from "@/lib/free-legal";
import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { termsSections } from "@/lib/legal";
export const metadata: Metadata = { title: "الشروط والأحكام" };
export default function Terms() {
  return <LegalPage title="الشروط والأحكام" lead={billingEnabled() ? "شروط استخدام المنصة والباقات والتجربة المجانية والدفع والإلغاء وحقوقك." : "شروط استخدام المنصة وحماية حسابك وحقوقك."} sections={billingEnabled() ? termsSections : freeTermsSections} />;
}
