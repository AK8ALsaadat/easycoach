import "server-only";
import { createPaylinkClient, isTestBaseUrl, normalizeBaseUrl, type PaylinkClient } from "./client";
import { startCheckout, verifyTransaction, type FlowDeps, type FlowLog } from "./flow";
import { openAccount } from "./seal";
import { paylinkStore } from "./store";

/**
 * PaylinkService: wires the payment rules to the real database and Paylink.
 *
 * Keys come from two places only:
 *  - PAYLINK_API_ID / PAYLINK_SECRET_KEY: the account of the coach whose id is in
 *    PAYLINK_ENV_COACH_ID (the platform owner coaching under EasyCoach).
 *  - Any other coach: their own keys, sealed with PAYLINK_CREDENTIALS_KEY.
 * PAYLINK_BASE_URL picks test (restpilot) or live (restapi) for everyone.
 */

export function paylinkBaseUrl(): string | null {
  return normalizeBaseUrl(process.env.PAYLINK_BASE_URL);
}

export function paylinkTestMode(): boolean {
  const base = paylinkBaseUrl();
  return base ? isTestBaseUrl(base) : true;
}

export function appUrl(): string {
  const value = process.env.APP_URL ?? "http://127.0.0.1:3200";
  return value.replace(/\/+$/, "");
}

function envCoachId(): string | null {
  const id = process.env.PAYLINK_ENV_COACH_ID?.trim().toLowerCase();
  return id && /^[0-9a-f-]{36}$/.test(id) ? id : null;
}

function envAccount() {
  const apiId = process.env.PAYLINK_API_ID?.trim();
  const secretKey = process.env.PAYLINK_SECRET_KEY?.trim();
  return apiId && secretKey ? { apiId, secretKey } : null;
}

export type ResolvedAccount = { source: "env" | "account"; apiId: string; secretKey: string; webhookSecret: string | null };

export async function accountFor(coachId: string): Promise<ResolvedAccount | null> {
  if (coachId === envCoachId()) {
    const env = envAccount();
    if (env) return { source: "env", ...env, webhookSecret: process.env.PAYLINK_WEBHOOK_SECRET?.trim() || null };
  }
  const sealed = await paylinkStore.accountGet(coachId);
  if (!sealed) return null;
  try {
    const account = openAccount(sealed, coachId);
    return { source: "account", ...account };
  } catch {
    paylinkLog("paylink.account.unreadable", { coach: coachId });
    return null;
  }
}

export async function clientFor(coachId: string): Promise<PaylinkClient | null> {
  const baseUrl = paylinkBaseUrl();
  if (!baseUrl) return null;
  const account = await accountFor(coachId);
  return account ? createPaylinkClient({ baseUrl, apiId: account.apiId, secretKey: account.secretKey }) : null;
}

/** Coaches (from the given ids) whose trainees can pay online. Never throws. */
export async function paylinkReadyCoaches(coachIds: string[]): Promise<string[]> {
  const ids = [...new Set(coachIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id)))];
  if (!ids.length || !paylinkBaseUrl()) return [];
  const ready = new Set<string>();
  const env = envCoachId();
  if (env && envAccount() && ids.includes(env)) ready.add(env);
  try {
    for (const id of await paylinkStore.readyCoaches(ids)) ready.add(id);
  } catch {
    // Migration not applied yet, or no service key: the button simply stays hidden.
  }
  return [...ready];
}

/** Codes, ids and order numbers only. Never keys, tokens, card data or response bodies. */
export const paylinkLog: FlowLog = (event, detail = {}) => {
  console.warn(JSON.stringify({ scope: "paylink", event, ...detail }));
};

function deps(): FlowDeps {
  return { store: paylinkStore, clientFor, appUrl: appUrl(), log: paylinkLog };
}

export const PaylinkService = {
  checkout: (input: { userId: string; subscriptionId: string; mobile?: string | null }) => startCheckout(deps(), input),
  verify: (ref: { transactionNo?: string | null; orderNumber?: string | null }) => verifyTransaction(deps(), ref),
};
