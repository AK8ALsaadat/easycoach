import Link from "next/link";
export default function NotFound() {
  return (
    <main className="empty min-h-screen">
      <h1>الصفحة غير موجودة</h1>
      <p>قد يكون الرابط غير صحيح أو لا تملك صلاحية الوصول إليه.</p>
      <Link className="btn" href="/coach">
        مساحتك
      </Link>
    </main>
  );
}
