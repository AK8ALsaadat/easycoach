import { timingSafeEqual } from "node:crypto";
import { runPhotoCleanupBatch } from "@/lib/photo-cleanup-worker";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32) return Response.json({ error: "Cleanup schedule is not configured" }, { status: 503, headers });
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from("Bearer " + secret);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
    return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  try { return Response.json(await runPhotoCleanupBatch(), { headers }); }
  catch { return Response.json({ error: "Cleanup failed; pending removals remain queued" }, { status: 503, headers }); }
}
