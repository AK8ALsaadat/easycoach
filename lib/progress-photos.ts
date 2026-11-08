import "server-only";
import { cookies } from "next/headers";
import { rpc } from "./server";
import { id } from "./model";

export type PhotoAsset = {
  id: string;
  client_id: string;
  coach_id: string;
  filename: string;
  size: number;
  mime: string;
  status: string;
  entry_date: string;
};
export const photoPath = (asset: PhotoAsset) =>
  `${asset.coach_id}/${asset.client_id}/${asset.id}`;
export async function accessPhoto(assetId: string, portalHash?: string | null) {
  id.parse(assetId);
  if (portalHash && !/^[a-f0-9]{64}$/.test(portalHash))
    throw Error("رابط غير صالح");
  const proof = portalHash
    ? (await cookies()).get("ec_portal_" + portalHash.slice(0, 12))?.value
    : null;
  const asset = await rpc<PhotoAsset | null>(
    "photo_access",
    { asset: assetId, portal_hash: portalHash ?? null, proof: proof ?? null },
    true,
  );
  if (!asset) throw Error("الصورة غير متاحة");
  return asset;
}
export function validPhoto(bytes: Uint8Array, mime: string) {
  if (mime === "image/jpeg")
    return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mime === "image/png")
    return (
      Buffer.from(bytes.subarray(0, 8)).toString("hex") === "89504e470d0a1a0a"
    );
  if (mime === "image/webp")
    return (
      Buffer.from(bytes.subarray(0, 4)).toString() === "RIFF" &&
      Buffer.from(bytes.subarray(8, 12)).toString() === "WEBP"
    );
  return false;
}
