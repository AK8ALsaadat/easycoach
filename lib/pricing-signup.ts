type SearchParams = Record<string, string | string[] | undefined>;

/** Keep campaign values, duplicates and empty parameters on the registration link. */
export function pricingSignupHref(searchParams: SearchParams) {
  const params = new URLSearchParams({ register: "1" });
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === "register" || value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) params.append(key, item);
  }
  return `/login?${params.toString()}`;
}
