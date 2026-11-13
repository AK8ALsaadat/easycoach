// Browser checks: accept the progress-photo notice (auto-opened, or via the
// "تفعيل صور التقدم" button) before choosing photos. Safe to call repeatedly.
export async function ensurePhotoConsent(page) {
  const dialog = page.getByRole("dialog", { name: "قبل ما ترفع صور التقدم" });
  if (!(await dialog.isVisible().catch(() => false))) {
    const enable = page.getByRole("button", { name: "تفعيل صور التقدم", exact: true }).first();
    if (!(await enable.isVisible().catch(() => false))) return;
    await enable.click();
  }
  await dialog.getByRole("button", { name: "موافق، أبي أرفع صور", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
}
/** Closes an auto-opened notice with "مو الحين" so it does not cover other steps. */
export async function dismissPhotoConsent(page) {
  const dialog = page.getByRole("dialog", { name: "قبل ما ترفع صور التقدم" });
  if (await dialog.isVisible().catch(() => false)) await dialog.getByRole("button", { name: "مو الحين", exact: true }).click();
}
