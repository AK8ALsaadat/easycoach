import { mkdir, open, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { localMode, rpc, hash } from "@/lib/server";
import { id as uuid } from "@/lib/model";
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!localMode()) return new Response(null, { status: 404 });
  const { id } = await params;
  let temporary = "";
  try {
    uuid.parse(id);
    if (
      request.headers.get("origin") !==
      new URL(process.env.APP_URL ?? request.url).origin
    )
      throw Error("origin");
    const token = request.headers.get("x-upload-token");
    let asset: { id: string; size: number; mime: string; status: string };
    if (token) {
      if (!/^[a-f0-9]{64}$/.test(token)) throw Error("token");
      const r = await rpc<{ asset: typeof asset }>(
        "upload_access",
        { token_hash: hash(token) },
        true,
      );
      asset = r.asset;
    } else asset = await rpc("media_access", { asset: id });
    if (asset?.id !== id || asset.status !== "pending") throw Error("access");
    const dir = path.join(process.cwd(), "data/videos");
    await mkdir(dir, { recursive: true });
    temporary = path.join(dir, id + ".part");
    const file = await open(temporary, "wx");
    let count = 0;
    let head: Uint8Array | undefined;
    try {
      const reader = request.body?.getReader();
      if (!reader) throw Error("file");
      while (true) {
        const r = await reader.read();
        if (r.done) break;
        count += r.value.byteLength;
        if (count > 200 * 1024 * 1024 || count > Number(asset.size)) {
          await reader.cancel();
          throw Error("size");
        }
        head ??= r.value;
        await file.write(r.value);
      }
      const sig = head && String.fromCharCode(...head.slice(4, 8));
      if (
        count !== Number(asset.size) ||
        !(
          sig === "ftyp" ||
          (head?.[0] === 0x1a &&
            head?.[1] === 0x45 &&
            head?.[2] === 0xdf &&
            head?.[3] === 0xa3)
        )
      )
        throw Error("format");
    } finally {
      await file.close();
    }
    await rename(temporary, path.join(dir, id));
    return Response.json({ ok: true });
  } catch {
    if (temporary) await unlink(temporary).catch(() => {});
    return Response.json(
      { error: "تعذر رفع الفيديو. تحقق من النوع والحجم ثم أعد المحاولة" },
      { status: 400 },
    );
  }
}
