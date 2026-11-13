/** Sends bytes with browser progress; only server finalization confirms saving. */
export function uploadPhotoBytes(url: string, file: File, headers: Record<string, string>, onProgress: (percent: number) => void): Promise<{ ok: boolean }> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.timeout = 120000;
    for (const [key, value] of Object.entries(headers)) request.setRequestHeader(key, value);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(Math.min(100, Math.round(event.loaded / event.total * 100)));
    };
    request.onload = () => resolve({ ok: request.status >= 200 && request.status < 300 });
    request.onerror = request.ontimeout = request.onabort = () => reject(new Error("Upload interrupted"));
    request.send(file);
  });
}

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
  onProgress?: (percent: number) => void,
) {
  let uploadError = "";
  try {
    const response = onProgress
      ? await uploadPhotoBytes(url, file, headers, onProgress)
      : await fetcher(url, { method: "PUT", headers, body: file });
    if (!response.ok) uploadError = "تعذر رفع الصورة. أعد المحاولة؛ ستبقى الصورة المختارة هنا.";
  } catch {
    uploadError = "انقطع الاتصال أثناء رفع الصورة. أعد المحاولة؛ ستبقى الصورة المختارة هنا.";
  }
  const result = await finish();
  if (!result.ok) throw Error(uploadError || result.error || "تعذر حفظ الصورة. أعد المحاولة.");
}
