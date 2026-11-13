import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";

/**
 * A coach's Paylink keys, sealed with AES-256-GCM under PAYLINK_CREDENTIALS_KEY
 * (32 random bytes, base64). The database only ever holds the sealed text.
 */

export type StoredPaylinkAccount = { apiId: string; secretKey: string; webhookSecret: string };

const Account = z.object({
  apiId: z.string().min(3).max(200),
  secretKey: z.string().min(8).max(400),
  webhookSecret: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
});

const VERSION = "v1";

function key(raw = process.env.PAYLINK_CREDENTIALS_KEY): Buffer {
  const bytes = raw ? Buffer.from(raw, "base64") : Buffer.alloc(0);
  if (bytes.length !== 32) throw new Error("PAYLINK_CREDENTIALS_KEY must be 32 bytes in base64");
  return bytes;
}

export function sealingConfigured(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

/** The coach id is bound as associated data, so a sealed row moved to another coach fails to open. */
export function sealAccount(account: StoredPaylinkAccount, coachId: string, rawKey?: string): string {
  const value = Account.parse(account);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(rawKey), iv);
  cipher.setAAD(Buffer.from(coachId));
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

export function openAccount(sealed: string, coachId: string, rawKey?: string): StoredPaylinkAccount {
  const [version, iv, tag, body] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || !body) throw new Error("Unreadable Paylink account");
  const decipher = createDecipheriv("aes-256-gcm", key(rawKey), Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(coachId));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  const text = Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
  return Account.parse(JSON.parse(text));
}

export function newWebhookSecret(): string {
  return randomBytes(32).toString("base64url");
}
