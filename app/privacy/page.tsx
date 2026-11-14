import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { privacySections } from "@/lib/legal";
export const metadata: Metadata = { title: "سياسة الخصوصية" };
export default function Privacy() {
  return <LegalPage title="سياسة الخصوصية" lead="ما البيانات التي نحتاجها، وكيف نستخدمها ونحميها، وكيف تتحكم في مشاركتها." sections={privacySections} />;
}
