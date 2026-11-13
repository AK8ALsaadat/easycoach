import "server-only";
import { removeProgressPhotoBytes } from "./photo-cleanup-files";
import { adminPhotoCleanupBatch } from "./photo-cleanup-admin";
export async function runPhotoCleanupBatch() {
  const jobs = await adminPhotoCleanupBatch([], true);
  const completed: string[] = [];
  let failed = 0;
  for (const job of jobs.slice(0, 100)) {
    try { await removeProgressPhotoBytes(job); completed.push(job.id); }
    catch { failed++; }
  }
  const remaining = await adminPhotoCleanupBatch(completed, false);
  return { removed: completed.length, failed, pendingInNextBatch: remaining.length };
}
