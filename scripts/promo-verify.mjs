// Real hosted Auth + RLS verification. Reads private credentials without printing them.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
const credentials = JSON.parse(await readFile("seed-credentials.json", "utf8"));
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
assert.equal(new URL(url).hostname, credentials.project + ".supabase.co");
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
assert(key);
const results = [];
for (const [index, account] of credentials.accounts.entries()) {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const login = await client.auth.signInWithPassword({ email: account.email, password: account.password });
  assert(!login.error, `Hosted password sign-in failed for promo account ${index + 1}: ${login.error?.code}`);
  assert.equal(login.data.user.id, account.id);
  const snapshot = await client.rpc("management_snapshot");
  assert(!snapshot.error, "Hosted snapshot failed");
  assert.deepEqual(snapshot.data.clients.map(c => c.id), [account.clientId]);
  assert(snapshot.data.programs.some(p => p.client_id === account.clientId && p.published_at));
  assert(snapshot.data.weights.length >= 35, "Historical weights missing");
  assert(snapshot.data.subscriptions.length >= 3, "Renewals missing");
  const foreign = credentials.accounts[(index + 1) % credentials.accounts.length];
  for (const table of ["clients", "programs", "weight_entries", "coaching_records", "subscriptions"]) {
    const response = await client.from(table).select(table === "clients" ? "id" : "client_id").eq(table === "clients" ? "id" : "client_id", foreign.clientId);
    assert(!response.error, `RLS read check failed for ${table}`);
    assert.deepEqual(response.data, [], `Cross-trainee ${table} exposure`);
  }
  const forbidden = await client.rpc("app_command", { command: "program_publish", payload: { id: foreign.clientId } });
  assert(forbidden.error, "Trainee reached a coach-only operation");
  const records = snapshot.data.management.records;
  assert(records.some(r => r.kind === "measurement"));
  assert(records.some(r => r.kind === "checkin"));
  assert(records.some(r => r.kind === "workout_log"));
  assert(records.every(r => r.client_id === account.clientId && r.kind !== "note"));
  results.push({ account: index + 1, name: account.name, passwordSignIn: true, isolatedRecords: true, weights: snapshot.data.weights.length, renewals: snapshot.data.subscriptions.length, records: records.length });
  await client.auth.signOut();
}
await writeFile(".local-dev/promo/hosted-verification.json", JSON.stringify({ project: credentials.project, results, synthetic: true }, null, 2));
console.log(JSON.stringify({ passedAccounts: results.length, hostedAuthAndRls: true, crossTraineeReadsDenied: true, coachOperationsDenied: true }, null, 2));
