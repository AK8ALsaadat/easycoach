import { NextResponse, type NextRequest } from "next/server";
import { snapshot } from "@/lib/server";
import { csvCell } from "@/lib/import-preview";
import { exportWorkbook } from "@/lib/export-workbook";
import { clientExport, clientExportCsv } from "@/lib/client-export";
export async function GET(request: NextRequest) {
  const data = await snapshot();
  const type = request.nextUrl.searchParams.get("type");
  // One trainee's data (offered before permanent deletion). The snapshot is
  // already limited to the coach's own clients by RLS.
  if ((type === "client-json" || type === "client-csv") && data.profile?.role === "coach") {
    const clientId = request.nextUrl.searchParams.get("client") ?? "";
    const exported = /^[0-9a-f-]{36}$/.test(clientId) ? clientExport(data, clientId) : null;
    if (!exported) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
    const name = `easycoach-client-${clientId.slice(0, 8)}`;
    return type === "client-csv"
      ? new NextResponse(clientExportCsv(exported), {
          headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"`, "Cache-Control": "private, no-store" },
        })
      : NextResponse.json(exported, {
          headers: { "Content-Disposition": `attachment; filename="${name}.json"`, "Cache-Control": "private, no-store" },
        });
  }
  if (type === "xlsx") {
    return new NextResponse(await exportWorkbook(data), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="easycoach-complete.xlsx"',
        "Cache-Control": "private, no-store",
      },
    });
  }
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
