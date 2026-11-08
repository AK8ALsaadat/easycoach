import { NextResponse, type NextRequest } from "next/server";
import { requireCoach, readableError, localMode } from "@/lib/server";
import { readImportFile } from "@/lib/import";
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const allowed = [
    new URL(process.env.APP_URL ?? request.url).origin,
    ...[process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL]
      .filter(Boolean)
      .map((host) => `https://${host}`),
    ...(localMode() ? ["http://127.0.0.1:3200", "http://localhost:3200"] : []),
  ];
  if (!origin || !allowed.includes(origin))
    return NextResponse.json({ error: "مصدر غير مسموح" }, { status: 403 });
  try {
    await requireCoach();
    const limit = localMode() ? 6 * 1024 * 1024 : 4_200_000;
    if (Number(request.headers.get("content-length") ?? 0) > limit)
      throw new Error("الملف أكبر من الحد الآمن");
    const reader = request.body?.getReader();
    if (!reader) throw new Error("الملف غير موجود");
    const chunks: ArrayBuffer[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new Error("الملف أكبر من الحد الآمن");
      }
      chunks.push(new Uint8Array(value).buffer);
    }
    const form = await new Response(new Blob(chunks), {
      headers: { "Content-Type": request.headers.get("content-type") ?? "" },
    }).formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("اختر ملفًا");
    if (!localMode() && file.size > 4_000_000)
      throw Error("حد الملف على الاستضافة 4MB؛ قسّمه إلى ملفات أصغر");
    const data = await readImportFile(
      new Uint8Array(await file.arrayBuffer()),
      file.name,
    );
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json({ error: readableError(e) }, { status: 400 });
  }
}
