import { NextResponse, type NextRequest } from "next/server";
import { snapshot } from "@/lib/server";
import { csvCell } from "@/lib/import-preview";
export async function GET(request: NextRequest) {
  const data = await snapshot();
  const type = request.nextUrl.searchParams.get("type");
  if (type === "clients" && data.profile?.role === "coach") {
    const rows = [
      ["الاسم", "الإيميل", "الجوال"],
      ...data.clients
        .filter((c) => !c.archived)
        .map((c) => [c.name, c.email, c.phone]),
    ];
    return new NextResponse(
      "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n"),
      {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="clients.csv"',
          "Cache-Control": "no-store",
        },
      },
    );
  }
  // Invitations never expose token hashes; snapshot is constrained by the caller's RLS.
  return NextResponse.json(
    {
      ...data,
      exported_at: new Date().toISOString(),
      notice: "سجل الدفعات ليس فاتورة ضريبية",
    },
    {
      headers: {
        "Content-Disposition": 'attachment; filename="easycoach-export.json"',
        "Cache-Control": "no-store",
      },
    },
  );
}
