import sharp from "sharp";

export const MAX_PROGRESS_PHOTO_BYTES = 10 * 1024 * 1024;
const formats: Record<string, string> = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Decode untrusted bytes on the server; never rely on browser canvas or EXIF claims. */
export async function sanitizeProgressPhoto(bytes: Uint8Array, mime: string) {
  if (!bytes.length || bytes.length > MAX_PROGRESS_PHOTO_BYTES || !formats[mime])
    throw Error("اختر صورة JPG أو PNG أو WebP بحجم لا يتجاوز 10 ميجابايت");
  try {
    const image = sharp(bytes, { limitInputPixels: 40000000, failOn: "warning" });
    const metadata = await image.metadata();
    if (metadata.format !== formats[mime] || (metadata.pages ?? 1) !== 1)
      throw Error("unsupported image");
    // No keepMetadata: removes EXIF/GPS, XMP, IPTC and embedded profiles.
    const resized = image.autoOrient().resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true });
    const output = mime === "image/jpeg"
      ? await resized.jpeg({ quality: 88 }).toBuffer()
      : mime === "image/png"
        ? await resized.png({ compressionLevel: 9 }).toBuffer()
        : await resized.webp({ quality: 88 }).toBuffer();
    if (output.length > MAX_PROGRESS_PHOTO_BYTES) throw Error("output too large");
    return output;
  } catch {
    throw Error("تعذر معالجة الصورة. اختر صورة ثابتة وسليمة بصيغة JPG أو PNG أو WebP، بأبعاد لا تتجاوز 40 مليون بكسل");
  }
}
