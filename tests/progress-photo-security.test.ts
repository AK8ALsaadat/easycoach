import { expect, it } from "vitest";
import sharp from "sharp";
import { sanitizeProgressPhoto, MAX_PROGRESS_PHOTO_BYTES } from "@/lib/sanitize-progress-photo";

it("strips server-side EXIF/GPS containers and embedded profiles while correcting orientation", async () => {
  const raw = await sharp({ create: { width: 600, height: 400, channels: 3, background: "#3a6a9e" } })
    .jpeg().withExif({ IFD0: { Artist: "Private identity" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "24/1 42/1 0/1" } })
    .withMetadata({ orientation: 6 }).toBuffer();
  const before = await sharp(raw).metadata();
  expect(before.exif).toBeDefined();
  expect(before.orientation).toBe(6);
  const clean = await sanitizeProgressPhoto(raw, "image/jpeg");
  const after = await sharp(clean).metadata();
  expect([after.width, after.height]).toEqual([400, 600]);
  expect(after.exif).toBeUndefined();
  expect(after.icc).toBeUndefined();
  expect(after.xmp).toBeUndefined();
  expect(after.iptc).toBeUndefined();
  expect(after.orientation).toBeUndefined();
});

it.each([["jpeg", "image/jpeg"], ["png", "image/png"], ["webp", "image/webp"]] as const)("decodes and bounds actual %s images without cropping bodies", async (format, mime) => {
  const raw = await sharp({ create: { width: 2560, height: 1440, channels: 3, background: "#dbe4ef" } }).toFormat(format).toBuffer();
  const clean = await sanitizeProgressPhoto(raw, mime);
  const info = await sharp(clean).metadata();
  expect([info.width, info.height, info.format]).toEqual([2048, 1152, format]);
  expect(clean.length).toBeLessThanOrEqual(MAX_PROGRESS_PHOTO_BYTES);
  expect((await sharp(clean).raw().toBuffer()).length).toBeGreaterThan(0);
});

it("rejects spoofed headers, truncated images, wrong MIME and oversized actual bytes", async () => {
  await expect(sanitizeProgressPhoto(Buffer.from([255, 216, 255, 0, 0]), "image/jpeg")).rejects.toThrow("تعذر معالجة الصورة");
  const png = await sharp({ create: { width: 20, height: 20, channels: 3, background: "#fff" } }).png().toBuffer();
  await expect(sanitizeProgressPhoto(png, "image/jpeg")).rejects.toThrow();
  await expect(sanitizeProgressPhoto(png.subarray(0, 24), "image/png")).rejects.toThrow();
  await expect(sanitizeProgressPhoto(new Uint8Array(MAX_PROGRESS_PHOTO_BYTES + 1), "image/jpeg")).rejects.toThrow("10 ميجابايت");
  await expect(sanitizeProgressPhoto(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), "image/svg+xml")).rejects.toThrow();
});
