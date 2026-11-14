import { createServer } from "node:http";
import { once } from "node:events";
import { expect, it } from "vitest";
import { uploadResumableVideo } from "@/lib/upload-exercise-video";

it("sends signed video chunks and resumes at the server offset after a temporary failure", async () => {
  const source = Object.assign(Buffer.alloc(13 * 1024 * 1024, 71), { type: "video/mp4" });
  const chunks: Buffer[] = [];
  let offset = 0, failed = false, resumed = false;
  const errors: string[] = [];
  const server = createServer(async (request, response) => {
    if (request.headers["x-signature"] !== "scoped-test-token") errors.push("missing signature");
    response.setHeader("Tus-Resumable", "1.0.0");
    if (request.method === "HEAD") {
      resumed = true;
      response.writeHead(200, { "Upload-Offset": offset, "Upload-Length": source.length });
      response.end();
      return;
    }
    if (request.method === "PATCH" && !failed) {
      failed = true;
      request.resume();
      response.writeHead(503);
      response.end();
      return;
    }
    const incoming: Buffer[] = [];
    for await (const data of request) incoming.push(Buffer.from(data));
    const chunk = Buffer.concat(incoming);
    if (chunk.length > 6 * 1024 * 1024) errors.push("oversized chunk");
    if (request.method === "PATCH" && Number(request.headers["upload-offset"]) !== offset) errors.push("incorrect resume offset");
    chunks.push(chunk);
    offset += chunk.length;
    response.writeHead(request.method === "POST" ? 201 : 204, {
      Location: "/video-upload",
      "Upload-Offset": offset,
    });
    response.end();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw Error("No test server");
  const progress: number[] = [];
  try {
    await uploadResumableVideo(source as unknown as File, {
      endpoint: `http://127.0.0.1:${address.port}/resumable`, token: "scoped-test-token", path: "coach/video.mp4",
    }, value => progress.push(value));
    expect(failed).toBe(true);
    expect(resumed).toBe(true);
    expect(errors).toEqual([]);
    expect(Buffer.concat(chunks).equals(source)).toBe(true);
    expect(progress.at(-1)).toBe(100);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
