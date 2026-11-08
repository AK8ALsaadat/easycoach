"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actor, rpc } from "@/lib/server";
import { defaultPreferences, type ManagementData } from "@/lib/management";
export async function changeLanguage(input: unknown) {
  const language = z.enum(["ar", "en"]).parse(input);
  if (await actor()) {
    const data = await rpc<{ management: ManagementData }>(
      "management_snapshot",
    );
    await rpc("management_command", {
      command: "preferences_save",
      payload: {
        ...defaultPreferences,
        ...data.management.preferences,
        language,
      },
    });
  }
  const jar = await cookies();
  jar.set("ec_language", language, {
    path: "/",
    sameSite: "lax",
    secure: process.env.APP_URL?.startsWith("https://"),
    httpOnly: true,
    maxAge: 365 * 86400,
  });
  revalidatePath("/", "layout");
  return { ok: true };
}
