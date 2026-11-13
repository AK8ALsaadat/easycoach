import "server-only";
import { rpc } from "./server";
import { removeProgressPhotoBytes } from "./photo-cleanup-files";
import { adminPhotoCleanupBatch } from "./photo-cleanup-admin";
export async function cleanPendingPhotos() {
  const jobs = await rpc<Array<{ id: string; asset_path: string }>>(
    "photo_cleanup",
    { completed: [] },
  );
  const completed: string[] = [];
  for (const job of jobs) {
    try {
      await removeProgressPhotoBytes(job);
      completed.push(job.id);
    } catch {
      /* Keep failed jobs for an explicit retry from account settings. */
    }
  }
  if (completed.length) await adminPhotoCleanupBatch(completed);
  const remaining = await rpc<unknown[]>("photo_cleanup", { completed: [] });
  return { removed: completed.length, pending: remaining.length };
}
