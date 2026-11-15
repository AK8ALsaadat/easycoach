// Server-only operator setup. Never import this script in the application bundle.
import { createClient } from "@supabase/supabase-js";
const number = process.env.VAT_NUMBER;
const rate = Number(process.env.VAT_RATE) * 100;
const approve = process.argv.includes("--approve-provider");
if (!number || !/^[0-9]{15}$/.test(number) || !process.env.VAT_RATE?.trim() || !Number.isSafeInteger(rate) || rate < 0 || rate > 10000)
  throw Error("Set the operator's actual VAT_NUMBER and VAT_RATE explicitly. No tax defaults are supplied.");
if (approve && process.env.PAYLINK_VERIFIED !== "true") throw Error("Confirm Paylink approval manually and set PAYLINK_VERIFIED before --approve-provider.");
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw Error("Server database configuration is required.");
const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const { error } = await client.rpc("ec_billing_operator_config", { registration_number: number, vat_basis_points: rate, approve_provider: approve });
if (error) throw Error("Operator setup failed. Apply the operator tax migration and check server database access.");
console.log(approve ? "Operator tax settings saved and manual provider approval recorded. Payment environment gates still apply." : "Operator tax settings saved. Provider approval was not changed.");
