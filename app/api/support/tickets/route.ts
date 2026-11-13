import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { actor, localMode, rpc } from "@/lib/server";
import { getLocalDatabase } from "@/lib/local-db";
import { adminSupportClient } from "@/lib/supabase/admin";
import { validPhoto } from "@/lib/progress-photos";

export const runtime = "nodejs";
const owner = (id: string) => Boolean(process.env.SUPPORT_OWNER_USER_ID && id === process.env.SUPPORT_OWNER_USER_ID);
const noStore = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };

export async function GET() {
  const user = await actor();
  if (!user) return Response.json({ error: "سجل الدخول أولاً" }, { status: 401, headers: noStore });
  try {
    if (localMode()) {
      const db = await getLocalDatabase();
      const result = owner(user.id)
        ? await db.query("select t.*,p.name as author_name from public.support_tickets t join public.profiles p on p.id=t.author_id order by t.created_at desc limit 300")
        : await db.query("select t.*,p.name as author_name from public.support_tickets t join public.profiles p on p.id=t.author_id where t.author_id=$1 order by t.created_at desc limit 100", [user.id]);
      return Response.json({ tickets: result.rows }, { headers: noStore });
    }
    if (owner(user.id)) {
      const result = await adminSupportClient().from("support_tickets").select("*,profiles!support_tickets_author_id_fkey(name)").order("created_at", { ascending: false }).limit(300);
      if (result.error) throw result.error;
      return Response.json({ tickets: result.data }, { headers: noStore });
    }
    const tickets = await rpc<unknown[]>("support_ticket_list");
    return Response.json({ tickets }, { headers: noStore });
  } catch {
    return Response.json({ error: "تعذر تحميل البلاغات" }, { status: 500, headers: noStore });
  }
}

export async function POST(request: NextRequest) {
  const user = await actor();
  if (!user) return Response.json({ error: "سجل الدخول أولاً" }, { status: 401, headers: noStore });
  if (request.headers.get("origin") !== new URL(process.env.APP_URL ?? request.url).origin)
    return Response.json({ error: "تعذر التحقق من الطلب" }, { status: 403, headers: noStore });
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 5.5 * 1024 * 1024) return Response.json({ error: "حجم الطلب أكبر من المسموح" }, { status: 413, headers: noStore });
  let pathKey: string | null = null;
  try {
    const form = await request.formData();
    const kind = String(form.get("kind") ?? "");
    const title = String(form.get("title") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();
    if (!["suggestion", "bug"].includes(kind) || title.length < 4 || title.length > 120 || description.length < 10 || description.length > 5000)
      return Response.json({ error: "تحقق من نوع الطلب والعنوان والوصف (10 أحرف على الأقل)" }, { status: 400, headers: noStore });
    const file = form.get("image");
    if (file instanceof File && file.size) {
      if (file.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type))
        return Response.json({ error: "الصورة يجب أن تكون JPG أو PNG أو WebP وبحجم أقل من 5 ميجابايت" }, { status: 400, headers: noStore });
      const bytes = Buffer.from(await file.arrayBuffer());
      if (!validPhoto(bytes, file.type)) return Response.json({ error: "محتوى الصورة غير صالح" }, { status: 400, headers: noStore });
      const ticketId = randomUUID();
      pathKey = `${user.id}/${ticketId}`;
      if (localMode()) {
        const folder = path.join(process.cwd(), "data/support-attachments");
        await mkdir(folder, { recursive: true });
        await writeFile(path.join(folder, ticketId), bytes, { flag: "wx" });
      } else {
        const { error } = await adminSupportClient().storage.from("support-attachments").upload(pathKey, bytes, { contentType: file.type, upsert: false });
        if (error) throw error;
      }
    }
    const ticket = await rpc<{ id: string }>("support_ticket_create", {
      p_kind: kind, p_title: title, p_description: description, p_attachment_path: pathKey,
    });
    return Response.json({ ok: true, ticket }, { status: 201, headers: noStore });
  } catch (error) {
    if (pathKey) {
      try {
        if (!localMode()) await adminSupportClient().storage.from("support-attachments").remove([pathKey]);
        else await unlink(path.join(process.cwd(), "data/support-attachments", pathKey.split("/").at(-1)!)).catch(()=>{});
      } catch { /* Retry cleanup is handled by storage lifecycle tooling. */ }
    }
    const limited = error instanceof Error && error.message.includes("ticket rate limit exceeded");
    return Response.json({ error: limited ? "وصلت للحد المسموح: 5 طلبات في الساعة" : "تعذر إرسال الطلب. حاول مرة أخرى" }, { status: limited ? 429 : 500, headers: noStore });
  }
}
