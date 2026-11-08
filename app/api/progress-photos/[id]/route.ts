import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { accessPhoto, photoPath, validPhoto } from "@/lib/progress-photos";
import { localMode } from "@/lib/server";
import { adminClient } from "@/lib/supabase/admin";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const asset = await accessPhoto(
      (await params).id,
      new URL(request.url).searchParams.get("portal"),
    );
    if (asset.status !== "ready") throw Error("pending");
    if (!localMode()) {
      const result = await adminClient()
        .storage.from("progress-photos")
        .createSignedUrl(photoPath(asset), 120);
      if (result.error) throw result.error;
      return new Response(null, {
        status: 307,
        headers: {
          Location: result.data.signedUrl,
          "Cache-Control": "private, no-store",
        },
      });
    }
    const bytes = await readFile(
      path.join(process.cwd(), "data/progress-photos", asset.id),
    );
    if (!validPhoto(bytes, asset.mime)) throw Error("format");
    return new Response(bytes, {
      headers: {
        "Content-Type": asset.mime,
        "Content-Length": String(bytes.length),
        "Content-Disposition": "inline",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!localMode()) return new Response(null, { status: 404 });
    if (
      request.headers.get("origin") !==
      new URL(process.env.APP_URL ?? request.url).origin
    )
      return new Response(null, { status: 403 });
    const asset = await accessPhoto(
      (await params).id,
      request.headers.get("x-portal-hash"),
    );
    if (asset.status !== "pending") throw Error("already uploaded");
    const reader = request.body?.getReader();
    if (!reader) throw Error("body");
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.length;
      if (length > Number(asset.size) || length > 10 * 1024 * 1024) {
        await reader.cancel();
        throw Error("size");
      }
      chunks.push(next.value);
    }
    const bytes = Buffer.concat(chunks);
    if (bytes.length !== Number(asset.size) || !validPhoto(bytes, asset.mime))
      throw Error("format");
    const folder = path.join(process.cwd(), "data/progress-photos");
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, asset.id), bytes, { flag: "wx" });
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "تعذر رفع الصورة. تحقق من النوع والحجم والصلاحية" },
      { status: 400 },
    );
  }
}
