const MAX_BYTES = 10 * 1024 * 1024;
const MAX_EDGE = 2048;

function imageFromFile(file: File): Promise<{ image: CanvasImageSource; width: number; height: number; release: () => void }> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file, { imageOrientation: "from-image" }).then(
      (bitmap) => ({
        image: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      }),
    );
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () =>
      resolve({
        image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        release: () => URL.revokeObjectURL(url),
      });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("تعذر فتح الصورة. اختر صورة بصيغة JPG أو PNG أو WebP."));
    };
    image.src = url;
  });
}

/** Re-encodes a phone image to normalize orientation, bound dimensions, and strip metadata. */
export async function prepareProgressPhoto(file: File): Promise<File> {
  if (!file.type.startsWith("image/"))
    throw new Error("اختر ملف صورة صالحًا.");
  if (file.size > 40 * 1024 * 1024)
    throw new Error("حجم الصورة كبير جدًا. اختر صورة أصغر من 40 ميجابايت.");

  const decoded = await imageFromFile(file);
  try {
    if (!decoded.width || !decoded.height)
      throw new Error("تعذر قراءة أبعاد الصورة.");
    const scale = Math.min(1, MAX_EDGE / Math.max(decoded.width, decoded.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(decoded.width * scale));
    canvas.height = Math.max(1, Math.round(decoded.height * scale));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("تعذر تجهيز الصورة على هذا الجهاز.");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(decoded.image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) =>
          result
            ? resolve(result)
            : reject(new Error("تعذر ضغط الصورة. أعد اختيارها وحاول مرة أخرى.")),
        "image/webp",
        0.88,
      );
    });
    if (blob.size > MAX_BYTES)
      throw new Error("تعذر ضغط الصورة إلى أقل من 10 ميجابايت.");
    const name = file.name.replace(/\.[^.]+$/, "") || "progress-photo";
    return new File([blob], `${name}.webp`, {
      type: "image/webp",
      lastModified: Date.now(),
    });
  } finally {
    decoded.release();
  }
}
