"use server";
import { randomBytes, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { portalFailure } from "@/lib/portal-request";
import { id, date, type PortalData } from "@/lib/model";
import {
  hash,
  localMode,
  readableError,
  requireCoach,
  requireCoachIdentity,
  rpc,
} from "@/lib/server";
import { adminClient } from "@/lib/supabase/admin";
import { bearerProof, resolvePortalCredential } from "@/lib/portal-credentials";

const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
const metadata = z.object({
  filename: z.string().min(1).max(160),
  size: z
    .number()
    .int()
    .min(1)
    .max(200 * 1024 * 1024),
  mime: z.enum(["video/mp4", "video/webm", "video/quicktime"]),
});
type Asset = {
  id: string;
  path: string;
  mime: string;
  filename: string;
  size: number;
  status: string;
};
export async function createPortal(clientId: string) {
  try {
    const cid = id.parse(clientId);
    await requireCoach();
    const token = randomBytes(32).toString("hex");
    const link = await rpc<{ id: string }>("bearer_portal_create", {
      client_id: cid,
      token_hash: hash(token),
      proof_hash: bearerProof(token),
    });
    revalidatePath("/coach");
    return { ok: true, url: `${process.env.APP_URL ?? "http://127.0.0.1:3200"}/access/${link.id}#${token}` };
  } catch (e) {
    return { ok: false, error: readableError(e) };
  }
}
export async function accessPortal(
  token: string,
  pin?: string,
  entry?: { entry_date: string; weight?: number; remove?: boolean },
) {
  try {
    const { key, proof } = await resolvePortalCredential(token, pin);
    const jar = await cookies();
    if (entry) {
      date.parse(entry.entry_date);
      if (!entry.remove) z.number().min(20).max(400).parse(entry.weight);
    }
    const weightResult = entry
      ? await rpc<PortalData & { error?: string }>(
          "portal_access",
          {
            token_hash: key,
            proof,
            day: entry?.entry_date ?? null,
            value: entry?.weight ?? null,
            remove: entry?.remove ?? false,
          },
          true,
        )
      : null;
    if (weightResult?.error) return portalFailure(weightResult.error);
    const result = await rpc<PortalData & { error?: string }>(
      "portal_management",
      { token_hash: key, proof, command: "snapshot", payload: {} },
      true,
    );
    if (result.error) return portalFailure(result.error);
    const schedule = await rpc<NonNullable<NonNullable<PortalData["management"]>["schedules"]>[number] | null>(
      "portal_schedule_snapshot",
      { token_hash: key, proof },
      true,
    );
    if (result.management) result.management.schedules = schedule ? [schedule] : [];
    jar.set("ec_portal_" + key.slice(0, 12), proof, {
      httpOnly: true,
      sameSite: "strict",
      secure: !localMode(),
      maxAge: 7 * 86400,
      path: "/",
    });
    const branding = await rpc<import("@/lib/coach-branding").CoachBranding | null>("coach_branding_link", { token_hash: key, link_type: "p" }, true);
    try {
      const consent = await rpc<import("@/lib/photo-consent").PhotoConsentState & { error?: string }>("portal_photo_consent", { token_hash: key, proof }, true);
      if (result.management && !consent.error) result.management.photo_consents = [consent];
    } catch {
      // Unknown consent state: uploads stay locked and no notice is shown.
    }
    return { ok: true, data: { ...result, coach_branding: branding, portalHash: key } };
  } catch (e) {
    return portalFailure(readableError(e));
  }
}
export async function optionalPortalAccount(reference: string) {
  try {
    const { key, proof } = await resolvePortalCredential(reference);
    const token = randomBytes(32).toString("hex");
    const result = await rpc<{ linked: boolean }>("portal_account_invite", { token_hash: key, proof, invitation_hash: hash(token) }, true);
    return { ok: true, url: result.linked ? "/login?next=%2Fme" : "/invite/" + token };
  } catch (error) { return { ok: false, error: readableError(error) }; }
}
export async function createPhoneUpload() {
  try {
    await requireCoach();
    const token = randomBytes(32).toString("hex");
    await rpc("app_command", {
      command: "upload_session",
      payload: { token_hash: hash(token) },
    });
    return { ok: true, token, url: `${process.env.APP_URL}/upload/${token}` };
  } catch (e) {
    return { ok: false, error: readableError(e) };
  }
}
export async function uploadTicket(input: unknown, phoneToken?: string) {
  try {
    const meta = metadata.parse(input);
    let asset: Asset;
    if (phoneToken) {
      tokenSchema.parse(phoneToken);
      const r = await rpc<{ asset: Asset }>(
        "upload_access",
        { token_hash: hash(phoneToken), payload: meta },
        true,
      );
      asset = r.asset;
      if (!asset || asset.status === "ready")
        throw Error("رابط الرفع استُخدم بالفعل");
    } else {
      await requireCoachIdentity();
      asset = await rpc<Asset>("app_command", {
        command: "media_reserve",
        payload: { ...meta, id: randomUUID() },
      });
    }
    const signed = localMode()
      ? undefined
      : await adminClient()
          .storage.from("coach-videos")
          .createSignedUploadUrl(asset.path, { upsert: false });
    if (signed?.error) throw signed.error;
    return {
      ok: true,
      id: asset.id,
      url: signed?.data?.signedUrl ?? `/api/local-upload/${asset.id}`,
      resumable: signed?.data ? {
        endpoint: new URL("/storage/v1/upload/resumable/sign", process.env.NEXT_PUBLIC_SUPABASE_URL!).href,
        token: signed.data.token,
        path: asset.path,
      } : undefined,
    };
  } catch (e) {
    return { ok: false, error: readableError(e) };
  }
}
export async function completeUpload(assetId: string, phoneToken?: string) {
  try {
    id.parse(assetId);
    let asset: Asset;
    if (phoneToken) {
      tokenSchema.parse(phoneToken);
      const r = await rpc<{ asset: Asset }>(
        "upload_access",
        { token_hash: hash(phoneToken) },
        true,
      );
      asset = r.asset;
      if (asset?.id !== assetId) throw Error("الفيديو غير متاح");
    } else {
      await requireCoachIdentity();
      asset = await rpc<Asset>("media_access", { asset: assetId });
    }
    if (!localMode()) {
      const admin = adminClient();
      // Storage metadata can lag a moment behind the PUT that created the
      // object, so a single info() right after the upload reports the wrong
      // size or nothing at all. Poll briefly, then say which it was.
      let info: { size: number } | null = null;
      for (let attempt = 0; attempt < 6 && !info; attempt++) {
        if (attempt) await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
        const { data } = await admin.storage.from("coach-videos").info(asset.path);
        if (data && data.size === Number(asset.size)) info = { size: data.size };
      }
      if (!info) throw Error("وصل الملف لكن ما اكتمل تأكيده. أعد المحاولة؛ الملف المرفوع محفوظ.");
      const signed = await admin.storage
        .from("coach-videos")
        .createSignedUrl(asset.path, 60);
      if (signed.error) throw signed.error;
      // Bounded: a hanging storage read must surface as an error with a retry,
      // not as a progress bar frozen at 95% with nothing happening.
      let bytes = new Uint8Array();
      try {
        const response = await fetch(signed.data.signedUrl, {
          headers: { Range: "bytes=0-31" },
          cache: "no-store",
          signal: AbortSignal.timeout(8000),
        });
        const reader = response.body?.getReader();
        if (!response.ok || !reader) throw Error("read failed");
        const chunk = await reader.read();
        await reader.cancel();
        bytes = chunk.value ?? new Uint8Array();
      } catch {
        throw Error("تعذر فحص الفيديو الآن. أعد المحاولة بعد لحظة؛ الملف المرفوع محفوظ.");
      }
      const signature = String.fromCharCode(...bytes.slice(4, 8));
      const webm =
        bytes[0] === 0x1a &&
        bytes[1] === 0x45 &&
        bytes[2] === 0xdf &&
        bytes[3] === 0xa3;
      if (signature !== "ftyp" && !webm)
        throw Error("صيغة الفيديو غير صالحة. استخدم MP4 أو WebM أو MOV");
    }
    if (phoneToken)
      await rpc(
        "upload_access",
        { token_hash: hash(phoneToken), payload: { complete: true } },
        true,
      );
    else
      await rpc("app_command", {
        command: "media_ready",
        payload: { id: assetId },
      });
    return { ok: true, id: assetId };
  } catch (e) {
    return { ok: false, error: readableError(e) };
  }
}
export async function phoneUploadStatus(token: string) {
  try {
    tokenSchema.parse(token);
    const r = await rpc<{ asset: Asset | null }>(
      "upload_access",
      { token_hash: hash(token) },
      true,
    );
    return {
      ok: true,
      id: r.asset?.status === "ready" ? r.asset.id : undefined,
    };
  } catch (e) {
    return { ok: false, error: readableError(e) };
  }
}
