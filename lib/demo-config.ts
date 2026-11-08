import { z } from "zod";
export const DEMO_EMAIL = "test@demo.easycoach.test";
export const demoCredentials = z.object({
  username: z.literal("test"),
  password: z.literal("test"),
});
export function isDemoIdentity(
  email: string | undefined,
  metadata: Record<string, unknown>,
) {
  return email === DEMO_EMAIL && metadata.demo === true;
}
