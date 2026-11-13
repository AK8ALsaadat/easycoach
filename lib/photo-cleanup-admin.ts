import "server-only";
import { localGuard, localMode } from "./server";
import { getLocalDatabase } from "./local-db";
import { adminClient } from "./supabase/admin";
import type { PhotoDeletionJob } from "./photo-cleanup-files";
export async function adminPhotoCleanupBatch(completed: string[], prune = false): Promise<PhotoDeletionJob[]> {
  if (localMode()) {
    await localGuard();
    const result = await (await getLocalDatabase()).query<{ jobs: PhotoDeletionJob[] }>("select public.photo_cleanup_batch($1::jsonb,$2::boolean) as jobs", [JSON.stringify(completed), prune]);
    return result.rows[0].jobs;
  }
  const result = await adminClient().rpc("photo_cleanup_batch", { completed, prune_abandoned: prune });
  if (result.error) throw result.error;
  return result.data as unknown as PhotoDeletionJob[];
}
