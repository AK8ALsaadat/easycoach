import { cookies } from "next/headers";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { exerciseMedia } from "@/lib/exercise-media";
import { actor, localMode, rpc, snapshot } from "@/lib/server";
import { adminClient } from "@/lib/supabase/admin";
import type { PortalData } from "@/lib/model";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!Object.hasOwn(exerciseMedia, id))
      return new Response(null, { status: 404 });
    const asset = exerciseMedia[id];
    const query = new URL(request.url).searchParams;
    const kind = query.get("kind");
    if (kind !== "poster" && kind !== "video")
      return new Response(null, { status: 404 });
    let allowed = false;
    const portal = query.get("portal");
    if (portal && /^[a-f0-9]{64}$/.test(portal)) {
      const proof = (await cookies()).get(
        "ec_portal_" + portal.slice(0, 12),
      )?.value;
      if (proof) {
        const access = await rpc<PortalData & { error?: string }>(
          "portal_access",
          { token_hash: portal, proof, day: null, value: null, remove: false },
          true,
        );
        allowed =
          !access.error &&
          Boolean(
            access.program?.content.days.some((day) =>
              day.exercises.some((exercise) => exercise.catalogId === id),
            ),
          );
      }
    } else if (await actor()) {
      const data = await snapshot();
      allowed =
        data.profile?.role === "coach" ||
        data.programs.some(
          (program) =>
            program.published_at &&
            program.content.days.some((day) =>
              day.exercises.some((exercise) => exercise.catalogId === id),
            ),
        );
    }
    if (!allowed)
      return new Response(null, {
        status: 404,
        headers: { "Cache-Control": "private, no-store" },
      });
    const file = `${asset.slug}.${kind === "poster" ? "webp" : "mp4"}`;
    if (!localMode()) {
      const signed = await adminClient()
        .storage.from("exercise-illustrations")
        .createSignedUrl(`movekit/${file}`, 120);
      if (signed.error) throw signed.error;
      return new Response(null, {
        status: 307,
        headers: {
          Location: signed.data.signedUrl,
          "Cache-Control": "private, no-store",
        },
      });
    }
    const bytes = await readFile(
      path.join(process.cwd(), "data/exercise-media/movekit", file),
    );
    let start = 0,
      end = bytes.length - 1;
    const range = request.headers.get("range");
    if (range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(range);
      if (!match) return new Response(null, { status: 416 });
      start = Number(match[1]);
      if (match[2]) end = Math.min(Number(match[2]), end);
      if (start > end) return new Response(null, { status: 416 });
    }
    return new Response(bytes.subarray(start, end + 1), {
      status: range ? 206 : 200,
      headers: {
        "Content-Type": kind === "poster" ? "image/webp" : "video/mp4",
        "Content-Length": String(end - start + 1),
        "Cache-Control": "private, no-store",
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
        "Accept-Ranges": "bytes",
        ...(range
          ? { "Content-Range": `bytes ${start}-${end}/${bytes.length}` }
          : {}),
      },
    });
  } catch {
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}
