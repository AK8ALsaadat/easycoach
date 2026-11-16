/** Explicit JS scrolling must also honor the user's reduced-motion preference. */
export function preferredScrollBehavior(): ScrollBehavior {
  return typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "instant"
    : "smooth";
}
