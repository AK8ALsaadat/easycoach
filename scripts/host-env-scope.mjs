/** Build a single-environment plan without making any hosting API request. */
export function hostEnvironmentPlan(environment, target = "production", production) {
  if (!["production", "preview", "development"].includes(target))
    throw Error("Select one deployment environment");
  if (!environment?.APP_URL || !environment.NEXT_PUBLIC_SUPABASE_URL)
    throw Error("APP_URL and NEXT_PUBLIC_SUPABASE_URL are required");
  const origin = value => new URL(value).origin;
  if (target !== "production") {
    if (!production?.APP_URL || !production.NEXT_PUBLIC_SUPABASE_URL)
      throw Error("Production reference is required to verify isolation");
    if (origin(environment.NEXT_PUBLIC_SUPABASE_URL) === origin(production.NEXT_PUBLIC_SUPABASE_URL))
      throw Error("Preview/development must use a separate Supabase project or branch");
    if (origin(environment.APP_URL) === origin(production.APP_URL))
      throw Error("Preview/development must use a separate application origin");
  }
  return Object.entries(environment).map(([key, value]) => ({
    key, value,
    type: key.startsWith("NEXT_PUBLIC_") || ["APP_URL", "APP_MODE"].includes(key) ? "plain" : "encrypted",
    target: [target],
  }));
}
