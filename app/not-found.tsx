import { cookies } from "next/headers";
import { translator } from "@/lib/i18n";
import Link from "next/link";
export default async function NotFound() {
  const tr = translator(
    (await cookies()).get("ec_language")?.value === "en" ? "en" : "ar",
  );
  return (
    <main className="empty min-h-screen">
      <h1>{tr("الصفحة غير موجودة")}</h1>
      <p>{tr("قد يكون الرابط غير صحيح أو لا تملك صلاحية الوصول إليه.")}</p>
      <Link className="btn" href="/coach">
        {tr("مساحتك")}
      </Link>
    </main>
  );
}
