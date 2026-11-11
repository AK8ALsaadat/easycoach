import { expect, it, vi } from "vitest";
import { uploadProgressPhoto } from "@/lib/upload-progress-photo";
const file = new File(["synthetic"], "front.webp", { type: "image/webp" });

it("recovers when an immutable upload already exists but the prior finalize failed", async () => {
  const put = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 409 }));
  const finish = vi.fn().mockResolvedValue({ ok: true });
  await expect(uploadProgressPhoto("/upload", file, {}, finish, put)).resolves.toBeUndefined();
  expect(put).toHaveBeenCalledTimes(1);
  expect(finish).toHaveBeenCalledTimes(1);
});

it("recovers an upload whose success acknowledgement was lost", async () => {
  const put = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("Network interrupted"));
  const finish = vi.fn().mockResolvedValue({ ok: true });
  await expect(uploadProgressPhoto("/upload", file, {}, finish, put)).resolves.toBeUndefined();
});

it("does not report success when a network failure left no uploaded image", async () => {
  const put = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("Offline"));
  const finish = vi.fn().mockResolvedValue({ ok: false, error: "الصورة غير متاحة" });
  await expect(uploadProgressPhoto("/upload", file, {}, finish, put)).rejects.toThrow("انقطع الاتصال");
  expect(finish).toHaveBeenCalledTimes(1);
});

it("preserves finalization failure after a successful PUT instead of claiming saved", async () => {
  const put = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
  const finish = vi.fn().mockResolvedValue({ ok: false, error: "تعذر حفظ الصورة" });
  await expect(uploadProgressPhoto("/upload", file, {}, finish, put)).rejects.toThrow("تعذر حفظ الصورة");
});
