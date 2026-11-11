/**
 * A failed response may mean an earlier immutable upload already exists, or
 * that the network lost its acknowledgement. Only server finalization decides
 * whether there is a valid, authorized image to save.
 */
export async function uploadProgressPhoto(
  url: string,
  file: File,
  headers: Record<string, string>,
  finish: () => Promise<{ ok: boolean; error?: string }>,
  fetcher: typeof fetch = fetch,
) {
  let uploadError = "";
  try {
    const response = await fetcher(url, { method: "PUT", headers, body: file });
    if (!response.ok) uploadError = "تعذر رفع الصورة. أعد المحاولة؛ ستبقى الصورة المختارة هنا.";
  } catch {
    uploadError = "انقطع الاتصال أثناء رفع الصورة. أعد المحاولة؛ ستبقى الصورة المختارة هنا.";
  }
  const result = await finish();
  if (!result.ok) throw Error(uploadError || result.error || "تعذر حفظ الصورة. أعد المحاولة.");
}
