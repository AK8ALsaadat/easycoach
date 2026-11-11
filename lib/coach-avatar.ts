import sharp from "sharp";

export async function prepareCoachAvatar(file: File) {
  if (file.size > 5 * 1024 * 1024 || file.size === 0)
    throw Error("اختر صورة بحجم لا يتجاوز 5 ميجابايت");
  try {
    const image = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 40000000, failOn: "warning" });
    const metadata = await image.metadata();
    if (!["jpeg", "png", "webp", "heif"].includes(metadata.format ?? "") || (metadata.pages ?? 1) > 1)
      throw Error("اختر صورة ثابتة بصيغة JPG أو PNG أو WebP");
    // autoOrient and no keepMetadata: correct phone rotation and strip EXIF/GPS.
    const bytes = await image.autoOrient().resize(512, 512, { fit: "cover" }).flatten({ background: "#132033" }).jpeg({ quality: 82 }).toBuffer();
    if (bytes.length > 250000) throw Error("الصورة كبيرة بعد المعالجة. اختر صورة أخرى");
    return bytes.toString("base64");
  } catch {
    throw Error("تعذر معالجة الصورة. اختر صورة ثابتة وسليمة بصيغة JPG أو PNG أو WebP، بأبعاد لا تتجاوز 40 مليون بكسل");
  }
}
