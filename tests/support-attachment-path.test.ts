import { expect, it } from "vitest";
import { supportAttachmentFilename } from "@/lib/support-attachment-path";
const author = "11111111-1111-4111-8111-111111111111";
const attachment = "22222222-2222-4222-8222-222222222222";
it("resolves the stored upload UUID independently of the database ticket ID", () => {
  expect(supportAttachmentFilename(`${author}/${attachment}`)).toBe(attachment);
});
it("rejects traversal, absolute paths and unstructured file keys", () => {
  for (const key of ["../secret", `${author}/../../secret`, `/tmp/${attachment}`, attachment, `${author}/${attachment}/extra`, `${author}\\${attachment}`])
    expect(() => supportAttachmentFilename(key)).toThrow("Invalid support attachment path");
});
