import sharp from "sharp";
export async function progressPhotoPreview(bytes: Uint8Array, variant: "thumbnail" | "comparison") {
  if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw Error("Invalid image size");
  const edge = variant === "thumbnail" ? 384 : 768;
  return sharp(bytes, { limitInputPixels: 40000000, failOn: "warning" }).autoOrient()
    .resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true })
    .webp({ quality: variant === "thumbnail" ? 72 : 82 }).toBuffer();
}
