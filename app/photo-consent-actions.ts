"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { id } from "@/lib/model";
import { readableError, rpc } from "@/lib/server";
import { resolvePortalCredential } from "@/lib/portal-credentials";
import { cleanDeletedPhoto } from "@/lib/deleted-photo-cleanup";
import type { PhotoConsentState } from "@/lib/photo-consent";

type ConsentResult = { ok: true; state: PhotoConsentState; message: string } | { ok: false; message: string };
type RpcState = PhotoConsentState & { deleted_photo_ids?: string[]; error?: string };

async function call(command: "accept" | "revoke", clientId: string, extra: { notice_version?: number; delete_photos?: boolean }, portalToken?: string) {
  const credential = portalToken ? await resolvePortalCredential(portalToken) : undefined;
  const state = await rpc<RpcState>(
    "photo_consent",
    {
      command,
      target: id.parse(clientId),
      notice_version: extra.notice_version ?? null,
      delete_photos: extra.delete_photos ?? false,
      portal_hash: credential?.key ?? null,
      proof: credential?.proof ?? null,
    },
    Boolean(portalToken),
  );
  if (state.error) throw Error(state.error);
  return { state, credential };
}

export async function acceptPhotoConsent(clientId: string, version: number, portalToken?: string): Promise<ConsentResult> {
  try {
    const { state } = await call("accept", clientId, { notice_version: z.number().int().positive().parse(version) }, portalToken);
    revalidatePath("/", "layout");
    return { ok: true, state, message: "تم حفظ موافقتك. تقدر ترفع صور التقدم الآن." };
  } catch (error) {
    return { ok: false, message: readableError(error) };
  }
}

/** Stops new uploads; optionally deletes every earlier photo and its private file. */
export async function revokePhotoConsent(clientId: string, deletePhotos: boolean, portalToken?: string): Promise<ConsentResult> {
  try {
    const { state, credential } = await call("revoke", clientId, { delete_photos: z.boolean().parse(deletePhotos) }, portalToken);
    let pending = 0;
    for (const photoId of state.deleted_photo_ids ?? []) {
      try {
        if ((await cleanDeletedPhoto(photoId, credential)).pending) pending++;
      } catch {
        pending++;
      }
    }
    revalidatePath("/", "layout");
    const message = !deletePhotos
      ? "أوقفنا رفع صور جديدة، وبقيت صورك السابقة."
      : pending
        ? "أوقفنا صور التقدم وحذفنا السجلات. بعض الملفات بانتظار إعادة محاولة الحذف تلقائيًا."
        : "أوقفنا صور التقدم وحذفنا كل صورك السابقة.";
    return { ok: true, state, message };
  } catch (error) {
    return { ok: false, message: readableError(error) };
  }
}
