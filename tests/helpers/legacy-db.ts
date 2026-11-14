import { openDatabase } from "@/lib/local-db";
/** Regression fixtures model customers onboarded before the platform rollout.
 * New Free accounts and all managed-plan limits are tested separately. */
export async function openLegacyDatabase(location?: string) {
  const db=await openDatabase(location);
  await db.exec("alter table public.ec_accounts alter column mode set default 'legacy'; update public.ec_accounts set mode='legacy'");
  return db;
}
