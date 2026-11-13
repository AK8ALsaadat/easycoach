import "server-only";
import { readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { localMode } from "./server";
import { adminClient } from "./supabase/admin";
export type PhotoDeletionJob = { id: string; asset_path: string };
export function validateDeletionJob(job: PhotoDeletionJob) {
  const asset = z.string().uuid().parse(job.id);
  const parts = job.asset_path.split("/");
  if (parts.length !== 3 || parts[2] !== asset) throw Error("Invalid deletion path");
  parts.forEach(value => z.string().uuid().parse(value));
  return asset;
}
export async function removeProgressPhotoBytes(job: PhotoDeletionJob, localDirectory = path.join(process.cwd(), "data/progress-photos")) {
  const asset = validateDeletionJob(job);
  if (localMode()) {
    try { await unlink(path.join(localDirectory, asset)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    // A process interruption during atomic sanitization can leave a private
    // temporary derivative. Delete only this asset's validated UUID suffixes.
    let entries: string[] = [];
    try { entries = await readdir(localDirectory); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    for (const entry of entries) {
      const prefix = `${asset}.clean-`;
      if (!entry.startsWith(prefix) || !z.string().uuid().safeParse(entry.slice(prefix.length)).success) continue;
      try { await unlink(path.join(localDirectory, entry)); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
  } else {
    const result = await adminClient().storage.from("progress-photos").remove([job.asset_path]);
    if (result.error) throw result.error;
  }
}
