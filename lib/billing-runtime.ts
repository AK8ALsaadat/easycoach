import "server-only";
import { cache } from "react";
import { billingEnabled } from "./billing-mode";
import { localPreview } from "./runtime";
import { getLocalDatabase } from "./local-db";
import { adminSupportClient } from "./supabase/admin";

/** Mirror the sole environment flag for SQL triggers and database-scheduled jobs.
 * Only the service role can change this value; client JWTs cannot bypass guards.
 * A changed environment takes effect on the next request after restart/deployment.
 */
export const syncBillingMode = cache(async () => {
  const enabled = billingEnabled();
  if (localPreview()) {
    await (await getLocalDatabase()).query("select public.ec_billing_runtime($1)", [enabled]);
  } else {
    const { error } = await adminSupportClient().rpc("ec_billing_runtime", { enabled });
    if (error) throw new Error("Platform configuration unavailable");
  }
});
