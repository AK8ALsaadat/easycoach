import { expect, it } from "vitest";
import { readLimitedBody, RequestBodyTooLarge } from "@/lib/request-body";

it("rejects chunked oversized input even without a length header and cancels the reader", async () => {
  let cancelled = false;
  const stream = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(8)); }, cancel() { cancelled = true; } });
  const request = new Request("http://localhost/upload", { method: "POST", body: stream, duplex: "half" } as RequestInit);
  await expect(readLimitedBody(request, 10)).rejects.toBeInstanceOf(RequestBodyTooLarge);
  expect(cancelled).toBe(true);
});
it("ignores a forged small length when actual input is oversized", async () => {
  const request = new Request("http://localhost/upload", { method: "POST", body: "oversized", headers: { "Content-Length": "1" } });
  await expect(readLimitedBody(request, 4)).rejects.toBeInstanceOf(RequestBodyTooLarge);
});
it("preserves accepted multipart bytes at the boundary and rejects oversized declarations", async () => {
  const request = new Request("http://localhost/upload", { method: "POST", body: "1234" });
  expect(new TextDecoder().decode(await readLimitedBody(request, 4))).toBe("1234");
  await expect(readLimitedBody(new Request("http://localhost/upload", { method: "POST", body: "a", headers: { "Content-Length": "20" } }), 4)).rejects.toBeInstanceOf(RequestBodyTooLarge);
});
