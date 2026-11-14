import { openLegacyDatabase as openDatabase } from "./helpers/legacy-db";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { rpcLocal, LOCAL_IDS } from "@/lib/local-db";
import { blankContent as defaultContent, type Snapshot } from "@/lib/model";
import { publishable } from "./helpers/db";
const blankContent = publishable(defaultContent);
import type { PGlite } from "@electric-sql/pglite";
let db: PGlite;
const { coach, other, trainee } = LOCAL_IDS;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const call = <T = unknown>(user: string | null, name: string, args = {}) => rpcLocal<T>(db, user, name, args);
const command = <T = unknown>(user: string, command: string, payload: unknown) => call<T>(user, "app_command", { command, payload });
let client: string, secondClient: string;
async function personalLink(clientId: string, user = coach) {
  const token = randomBytes(32).toString("hex"), key = hash(token), proof = hash("EasyCoach/bearer/v1:" + token);
  const result = await call<{ id: string }>(user, "bearer_portal_create", { client_id: clientId, token_hash: key, proof_hash: proof });
  return { ...result, token, key, proof };
}
async function exchange(link: Awaited<ReturnType<typeof personalLink>>, session = randomBytes(32).toString("hex")) {
  expect(await call(null, "bearer_portal_exchange", { portal_id: link.id, token_hash: link.key, proof: link.proof, session_hash: hash(session) })).toBe(true);
  return { session, context: await call<{ key: string; proof: string }>(null, "portal_session_context", { portal_id: link.id, session_hash: hash(session) }) };
}
beforeAll(async () => {
  db = await openDatabase();
  for (const [uid, role, email] of [[coach, "coach", "coach@example.test"], [other, "coach", "other@example.test"], [trainee, "trainee", "trainee@example.test"]]) {
    await db.query("insert into auth.users values($1,$2,'synthetic',now())", [uid, email]);
    await call(uid, "init_profile", { display_name: "Synthetic account", requested_role: role });
  }
  client = (await command<{ id: string }>(coach, "client_save", { name: "First trainee", email: "trainee@example.test", phone: "" })).id;
  secondClient = (await command<{ id: string }>(coach, "client_save", { name: "Second trainee", email: "second@example.test", phone: "" })).id;
});
afterAll(async () => { await db?.close(); });

it("opens a scoped portal anonymously with an expiring hashed session and exposes no trainee details in previews", async () => {
  const first = await personalLink(client), second = await personalLink(secondClient);
  const a = await exchange(first), b = await exchange(second);
  expect(a.context).toEqual({ key: first.key, proof: first.proof });
  const one = await call<{ name: string }>(null, "portal_management", { token_hash: a.context.key, proof: a.context.proof, command: "snapshot", payload: {} });
  const two = await call<{ name: string }>(null, "portal_management", { token_hash: b.context.key, proof: b.context.proof, command: "snapshot", payload: {} });
  expect(one.name).toBe("First trainee"); expect(two.name).toBe("Second trainee");
  expect(await call(null, "portal_session_context", { portal_id: second.id, session_hash: hash(a.session) })).toBeNull();
  expect(await call(null, "bearer_portal_exchange", { portal_id: second.id, token_hash: first.key, proof: first.proof, session_hash: hash("bad") })).toBe(false);
  const branding = await call<Record<string, unknown>>(null, "public_portal_branding", { portal_id: first.id });
  expect(Object.keys(branding).sort()).toEqual(["avatar_id", "name"]);
  const stored = await db.query("select * from public.portal_links where id=$1", [first.id]);
  expect(JSON.stringify(stored.rows)).not.toContain(first.token);
  const sessions = await db.query("select * from private.trainee_portal_sessions");
  expect(JSON.stringify(sessions.rows)).not.toContain(a.session);
});

it("revokes all derived sessions and replacement links without disabling a linked account", async () => {
  await db.query("update public.clients set trainee_user_id=$1 where id=$2", [trainee, client]);
  const link = await personalLink(client), session = await exchange(link);
  await command(coach, "portal_revoke", { client_id: client });
  expect(await call(null, "portal_session_context", { portal_id: link.id, session_hash: hash(session.session) })).toBeNull();
  expect(await call(null, "public_portal_branding", { portal_id: link.id })).toBeNull();
  expect((await call<Snapshot>(trainee, "management_snapshot")).clients.some(c => c.id === client)).toBe(true);
  const replacement = await personalLink(client), replacementSession = await exchange(replacement);
  await personalLink(client);
  expect(await call(null, "portal_session_context", { portal_id: replacement.id, session_hash: hash(replacementSession.session) })).toBeNull();
});

it("rejects expired sessions, expired or missing links, foreign coaches and direct session-table access", async () => {
  const link = await personalLink(client), session = await exchange(link);
  await db.query("update private.trainee_portal_sessions set expires_at=now()-interval '1 second' where portal_id=$1", [link.id]);
  expect(await call(null, "portal_session_context", { portal_id: link.id, session_hash: hash(session.session) })).toBeNull();
  await db.query("update public.portal_links set expires_at=now()-interval '1 second' where id=$1", [link.id]);
  expect(await call(null, "bearer_portal_exchange", { portal_id: link.id, token_hash: link.key, proof: link.proof, session_hash: hash("expired") })).toBe(false);
  await expect(personalLink(client, other)).rejects.toThrow();
  await expect(db.transaction(async tx => { await tx.exec("set local role anon"); await tx.exec("select * from private.trainee_portal_sessions"); })).rejects.toThrow();
});

it("keeps existing PIN links usable and refuses exchanging them as bearer credentials", async () => {
  const token = randomBytes(32).toString("hex"), key = hash(token), proof = hash(token + ":123456");
  const old = await command<{ id: string }>(coach, "portal_create", { client_id: secondClient, token_hash: key, proof_hash: proof });
  expect(await call(null, "bearer_portal_exchange", { portal_id: old.id, token_hash: key, proof, session_hash: hash("legacy") })).toBe(false);
  const result = await call<{ name: string }>(null, "portal_access", { token_hash: key, proof });
  expect(result.name).toBe("Second trainee");
});

it("optional accounts require the coach-recorded verified email and preserve the original client and history", async () => {
  await db.query("update public.clients set trainee_user_id=null where id=$1", [client]);
  const program = await command<{ id: string }>(coach, "program_save", { client_id: client, name: "Existing history", content: blankContent });
  await command(coach, "program_publish", { id: program.id });
  const link = await personalLink(client), inviteHash = hash("optional-invite");
  const before = await db.query("select id from public.clients");
  expect(await call(null, "portal_account_invite", { token_hash: link.key, proof: link.proof, invitation_hash: inviteHash })).toMatchObject({ linked: false });
  await expect(call(other, "claim_invite", { token: inviteHash })).rejects.toThrow();
  await call(trainee, "claim_invite", { token: inviteHash });
  expect((await call<Snapshot>(trainee, "management_snapshot")).programs.some(p => p.id === program.id)).toBe(true);
  expect((await db.query("select id from public.clients")).rows).toEqual(before.rows);
  expect(await call(null, "portal_account_invite", { token_hash: link.key, proof: link.proof, invitation_hash: hash("again") })).toEqual({ linked: true });
});
