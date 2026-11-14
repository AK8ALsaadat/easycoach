import "server-only";
import { adminClient } from "./supabase/admin";

/** True when an account already owns this address.
 *
 * Auth's signUp deliberately hides that fact to prevent user enumeration: for
 * an address that already has an account it returns a success-shaped response
 * and sends mail instead of an error, so the owner waited for a code that
 * could never create a second account — init_profile refuses the duplicate
 * only after the mail was already sent. public.profiles is the server-side
 * source of truth, read with the service role because RLS hides other
 * people's rows.
 *
 * Accounts exist only after a confirmed email, so an address whose signup was
 * never confirmed is not reported here: that registration must still be able
 * to resend its confirmation.
 *
 * Any lookup failure returns false, so a missing service-role key or a
 * database hiccup cannot block registration; the duplicate is then still
 * refused by init_profile as before.
 */
export async function emailHasAccount(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  try {
    // init_profile stores the normalized address; rows predating that are
    // matched by their exact spelling as well, without LIKE wildcards.
    const candidates = [...new Set([normalized, email.trim()])];
    const { data, error } = await adminClient()
      .from("profiles")
      .select("id")
      .in("email", candidates)
      .limit(1);
    if (error) {
      console.error("profile email lookup failed", error.code, error.message);
      return false;
    }
    return (data?.length ?? 0) > 0;
  } catch (error) {
    console.error("profile email lookup unavailable", (error as Error).message);
    return false;
  }
}
