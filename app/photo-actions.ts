"use server";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { id, date } from "@/lib/model";
import { localMode, readableError, rpc } from "@/lib/server";
import { adminClient } from "@/lib/supabase/admin";
import { getLocalDatabase } from "@/lib/local-db";
import { cleanDeletedPhoto } from "@/lib/deleted-photo-cleanup";
import {
  accessPhoto,
  photoPath,
  type PhotoAsset,
} from "@/lib/progress-photos";
import { sanitizeProgressPhoto } from "@/lib/sanitize-progress-photo";
import { resolvePortalCredential } from "@/lib/portal-credentials";

const metadata = z
  .object({
    id: id.optional(),
    client_id: id,
    entry_date: date,
    angle: z.enum(["front", "back", "side"]),
    consent_confirmed: z.literal(true),
    filename: z.string().min(1).max(160),
    size: z
      .number()
      .int()
      .min(1)
      .max(10 * 1024 * 1024),
    mime: z.enum(["image/jpeg", "image/png", "image/webp"]),
  })
  .strict();
export async function photoTicket(input: unknown, portalToken?: string) {
  try {
    const parsed = metadata.parse(input);
    const payload = { ...parsed, id: parsed.id ?? randomUUID() };
    let asset: PhotoAsset;
    if (portalToken) {
      const { key, proof } = await resolvePortalCredential(portalToken);
      asset = await rpc(
        "portal_management",
        { token_hash: key, proof, command: "photo_reserve", payload },
        true,
      );
    } else
      asset = await rpc("management_command", {
        command: "photo_reserve",
        payload,
      });
    if (!asset.id) throw Error("تعذر تجهيز الصورة");
    if (asset.status === "ready")
      return { ok: true, id: asset.id, alreadyReady: true };
    const signed = localMode()
      ? null
      : await adminClient()
          .storage.from("progress-photos")
          .createSignedUploadUrl(photoPath(asset), { upsert: false });
    if (signed?.error) throw signed.error;
    return {
      ok: true,
      id: asset.id,
      url: signed?.data.signedUrl ?? `/api/progress-photos/${asset.id}`,
      portalHash: portalToken ? (await resolvePortalCredential(portalToken)).key : undefined,
    };
  } catch (error) {
    return { ok: false, error: readableError(error) };
  }
}
export async function finishPhoto(assetId: string, portalToken?: string) {
  try {
    const portalHash = portalToken ? (await resolvePortalCredential(portalToken)).key : undefined;
    const asset = await accessPhoto(assetId, portalHash);
    if (asset.status === "ready") return { ok: true, id: asset.id };
    if (asset.status !== "pending") throw Error("الصورة غير متاحة");
    let bytes: Uint8Array;
    if (localMode())
      bytes = await readFile(
        path.join(process.cwd(), "data/progress-photos", asset.id),
      );
    else {
      const result = await adminClient()
        .storage.from("progress-photos")
        .download(photoPath(asset));
      if (result.error) throw result.error;
      bytes = new Uint8Array(await result.data.arrayBuffer());
    }
    // Reservation size remains the original upload fingerprint. A retry can
    // encounter already-sanitized bytes if finalization failed after Storage
    // update, so validate actual byte/pixel limits rather than the original size.
    const sanitized = await sanitizeProgressPhoto(bytes, asset.mime);
    if (localMode()) {
      const target = path.join(process.cwd(), "data/progress-photos", asset.id);
      const temporary = `${target}.clean-${randomUUID()}`;
      try {
        await writeFile(temporary, sanitized, { flag: "wx" });
        await rename(temporary, target);
      } finally {
        await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error;
        });
      }
    } else {
      // Update the existing object without a delete/create gap. The upload
      // ticket is non-upsert, so it cannot overwrite this sanitized object.
      const updated = await adminClient().storage.from("progress-photos")
        .update(photoPath(asset), sanitized, { contentType: asset.mime, cacheControl: "0", upsert: false });
      if (updated.error) throw updated.error;
    }
    if (localMode()) {
      const result = await (
        await getLocalDatabase()
      ).query<{ finalized: boolean }>("select private.finalize_photo($1::uuid) as finalized", [asset.id]);
      if (result.rows[0]?.finalized !== true) throw Error("تعذر حفظ الصورة. حدّث الصفحة وأعد المحاولة");
    } else {
      const result = await adminClient().rpc("finalize_photo", {
        asset: asset.id,
      });
      if (result.error) throw result.error;
      if (result.data !== true) throw Error("تعذر حفظ الصورة. حدّث الصفحة وأعد المحاولة");
    }
    revalidatePath("/", "layout");
    return { ok: true, id: asset.id };
  } catch (error) {
    return { ok: false, error: readableError(error) };
  }
}

export async function deleteProgressPhoto(assetId: string, portalToken?: string) {
  try {
    const photoId = id.parse(assetId);
    const credential = portalToken ? await resolvePortalCredential(portalToken) : undefined;
    // Lost-response retries can finish an authorized deletion whose row was
    // already removed, without requiring the deleted row to reappear.
    try {
      const previous = await cleanDeletedPhoto(photoId, credential);
      if (previous.found) { revalidatePath("/", "layout"); return { ok: true, cleanupPending: previous.pending }; }
    } catch { /* The normal row deletion below remains authoritative. */ }
    if (portalToken) {
      const { key, proof } = await resolvePortalCredential(portalToken);
      const result = await rpc<{ error?: string }>(
        "portal_management",
        { token_hash: key, proof, command: "photo_delete", payload: { id: photoId } },
        true,
      );
      if (result.error) throw Error(result.error);
    } else {
      const result = await rpc<{ error?: string }>("management_command", {
        command: "photo_delete",
        payload: { id: photoId },
      });
      if (result.error) throw Error(result.error);
    }
    let cleanupPending = true;
    try { cleanupPending = (await cleanDeletedPhoto(photoId, credential)).pending; }
    catch { /* A durable queue keeps the removal retryable. */ }
    revalidatePath("/", "layout");
    return { ok: true, cleanupPending };
  } catch (error) {
    return { ok: false, error: readableError(error) };
  }
}
