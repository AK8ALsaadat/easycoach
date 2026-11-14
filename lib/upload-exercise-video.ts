import { Upload } from "tus-js-client";

export type ResumableVideoTicket = { endpoint: string; token: string; path: string };

/** Scoped signed token, never an Auth token or a service-role credential.
 * https://supabase.com/docs/guides/storage/uploads/resumable-uploads
 */
export function uploadResumableVideo(file: File, ticket: ResumableVideoTicket, onProgress: (percent: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: ticket.endpoint,
      headers: { "x-signature": ticket.token },
      chunkSize: 6 * 1024 * 1024,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      uploadDataDuringCreation: true,
      // Upload URLs contain capabilities; keep them in memory only.
      storeFingerprintForResuming: false,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: "coach-videos",
        objectName: ticket.path,
        contentType: file.type,
        cacheControl: "3600",
      },
      onProgress: (sent, total) => onProgress(total ? Math.round(sent / total * 100) : 0),
      onSuccess: () => resolve(),
      onError: () => reject(new Error("انقطع رفع الفيديو بعد إعادة المحاولة. تحقق من اتصالك وأعد اختيار الملف.")),
    });
    upload.start();
  });
}
