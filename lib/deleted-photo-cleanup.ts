import "server-only";
import { rpc } from "./server";
import { removeProgressPhotoBytes, type PhotoDeletionJob } from "./photo-cleanup-files";
import { adminPhotoCleanupBatch } from "./photo-cleanup-admin";
export async function cleanDeletedPhoto(asset: string, credential?: { key: string; proof: string }) {
  const args = { asset, portal_hash: credential?.key ?? null, proof: credential?.proof ?? null };
  const job = await rpc<PhotoDeletionJob & { error?: string } | null>("photo_cleanup_authorized", args, true);
  if (job?.error) throw Error(job.error);
  if (!job) return { found: false, pending: false };
  try {
    await removeProgressPhotoBytes(job);
    await adminPhotoCleanupBatch([asset]);
    return { found: true, pending: false };
  } catch { return { found: true, pending: true }; }
}
