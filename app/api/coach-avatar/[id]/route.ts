import { rpc } from "@/lib/server";
import { id } from "@/lib/model";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsed = id.safeParse((await params).id);
  if (!parsed.success) return new Response(null, { status: 404 });
  const data = await rpc<string | null>("coach_branding_avatar", { asset: parsed.data }, true);
  if (!data) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(Buffer.from(data, "base64"), { headers: {
    "Content-Type": "image/jpeg", "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
  } });
}
