import { resolvePortalMediaCredential } from "@/lib/portal-credentials";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { rpc, localMode } from "@/lib/server";
import { adminClient } from "@/lib/supabase/admin";
import { id as uuid } from "@/lib/model";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    uuid.parse(id);
    const portal = new URL(request.url).searchParams.get("portal");
    const proof = portal ? (await resolvePortalMediaCredential(portal)).proof : undefined;
    const asset = await rpc<{ path: string; mime: string; status: string }>(
      "media_access",
      { asset: id, portal_hash: portal, proof: proof ?? null },
      true,
    );
    if (asset.status !== "ready")
      return new Response("الفيديو قيد الرفع", { status: 404 });
    if (!localMode()) {
      const r = await adminClient()
        .storage.from("coach-videos")
        .createSignedUrl(asset.path, 120);
      if (r.error) throw r.error;
      return new Response(null, {
        status: 307,
        headers: {
          Location: r.data.signedUrl,
          "Cache-Control": "private, no-store",
        },
      });
    }
    const data = await readFile(path.join(process.cwd(), "data/videos", id));
    const range = request.headers.get("range");
    let start = 0,
      end = data.length - 1;
    if (range) {
      const m = /^bytes=(\d+)-(\d*)$/.exec(range);
      if (!m) return new Response(null, { status: 416 });
      start = Number(m[1]);
      if (m[2]) end = Math.min(Number(m[2]), end);
      if (start > end) return new Response(null, { status: 416 });
    }
    return new Response(data.subarray(start, end + 1), {
      status: range ? 206 : 200,
      headers: {
        "Content-Type": asset.mime,
        "Accept-Ranges": "bytes",
        "Content-Length": String(end - start + 1),
        ...(range
          ? { "Content-Range": `bytes ${start}-${end}/${data.length}` }
          : {}),
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new Response("الفيديو غير متاح", { status: 404 });
  }
}
