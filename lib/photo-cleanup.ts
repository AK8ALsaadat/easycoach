import "server-only";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { rpc, localMode } from "./server";
import { adminClient } from "./supabase/admin";
import { id } from "./model";
export async function cleanPendingPhotos() {
  const jobs = await rpc<Array<{ id: string; asset_path: string }>>(
    "photo_cleanup",
    { completed: [] },
  );
  const completed: string[] = [];
  for (const job of jobs) {
    try {
      id.parse(job.id);
      if (localMode()) {
        try {
          await unlink(
            path.join(process.cwd(), "data/progress-photos", job.id),
          );
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      } else {
        const result = await adminClient()
          .storage.from("progress-photos")
          .remove([job.asset_path]);
        if (result.error) throw result.error;
      }
      completed.push(job.id);
    } catch {
      /* Keep failed jobs for an explicit retry from account settings. */
    }
  }
  const remaining = await rpc<unknown[]>("photo_cleanup", { completed });
  return { removed: completed.length, pending: remaining.length };
}
