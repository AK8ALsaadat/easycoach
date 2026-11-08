"use server";
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { id, date, type PortalData } from "@/lib/model";
import {
  hash,
  localMode,
  readableError,
  requireCoach,
  rpc,
} from "@/lib/server";
import { adminClient } from "@/lib/supabase/admin";

const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
const metadata = z.object({
  filename: z.string().min(1).max(160),
  size: z
    .number()
    .int()
    .min(1)
    .max(50 * 1024 * 1024),
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
    const token = randomBytes(32).toString("hex"),
      pin = String(randomInt(100000, 1000000));
    await rpc("app_command", {
      command: "portal_create",
      payload: {
        client_id: cid,
        token_hash: hash(token),
        proof_hash: hash(token + ":" + pin),
      },
    });
    revalidatePath("/coach");
    return { ok: true, url: `${process.env.APP_URL}/p/${token}`, pin };
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
    tokenSchema.parse(token);
    const key = hash(token),
      jar = await cookies();
    const proof = pin
      ? hash(
          token +
            ":" +
            z
              .string()
              .regex(/^\d{6}$/)
              .parse(pin),
        )
      : jar.get("ec_portal_" + key.slice(0, 12))?.value;
    if (!proof) return { ok: false, error: "أدخل رمز الدخول من مدربك" };
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
    if (weightResult?.error) return { ok: false, error: weightResult.error };
    const result = await rpc<PortalData & { error?: string }>(
      "portal_management",
      { token_hash: key, proof, command: "snapshot", payload: {} },
      true,
    );
    if (result.error) return { ok: false, error: result.error };
    jar.set("ec_portal_" + key.slice(0, 12), proof, {
      httpOnly: true,
      sameSite: "strict",
      secure: !localMode(),
      maxAge: 7 * 86400,
      path: "/",
    });
    return { ok: true, data: { ...result, portalHash: key } };
  } catch (e) {
    return { ok: false, error: readableError(e) };
  }
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
      await requireCoach();
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
      await requireCoach();
      asset = await rpc<Asset>("media_access", { asset: assetId });
    }
    if (!localMode()) {
      const admin = adminClient();
      const { data, error } = await admin.storage
        .from("coach-videos")
        .info(asset.path);
      if (error || !data || data.size !== Number(asset.size))
        throw Error("لم يكتمل رفع الملف");
      const signed = await admin.storage
        .from("coach-videos")
        .createSignedUrl(asset.path, 60);
      if (signed.error) throw signed.error;
      const response = await fetch(signed.data.signedUrl, {
        headers: { Range: "bytes=0-31" },
        cache: "no-store",
      });
      const reader = response.body?.getReader();
      if (!response.ok || !reader) throw Error("تعذر فحص الفيديو");
      const chunk = await reader.read();
      await reader.cancel();
      const bytes = chunk.value ?? new Uint8Array();
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
