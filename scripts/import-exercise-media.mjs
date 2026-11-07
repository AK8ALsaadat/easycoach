// The commercial sample permits in-app use, not public redistribution of raw assets.
// Keep these files in ignored data/ or the private Storage bucket, never public/ or Git.
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const source = "https://movekit.com/downloads/movekit-free-sample.zip";
const root = "data/exercise-media/movekit";
const slugs = ["pull-ups", "dumbbell-chest-fly"];
await mkdir(root, { recursive: true });
const response = await fetch(source);
if (!response.ok) throw Error(`Sample download failed: ${response.status}`);
const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
const required = [
  "LICENSE.txt",
  "metadata.json",
  ...slugs.flatMap((slug) => [`${slug}.mp4`, `posters/${slug}.png`]),
];
for (const name of required)
  if (!files[name]) throw Error(`Missing sample file: ${name}`);
await writeFile(`${root}/LICENSE.txt`, files["LICENSE.txt"]);
const audit = [];
for (const slug of slugs) {
  const poster = await sharp(files[`posters/${slug}.png`])
    .resize({ width: 960, withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer();
  for (const [name, bytes] of [
    [`${slug}.webp`, poster],
    [`${slug}.mp4`, files[`${slug}.mp4`]],
  ]) {
    await writeFile(`${root}/${name}`, bytes);
    audit.push({
      file: name,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
}
await writeFile(
  `${root}/audit.json`,
  JSON.stringify(
    { source, license: "https://movekit.com/license", assets: audit },
    null,
    2,
  ),
);
if (process.argv.includes("--upload")) {
  const envFileIndex = process.argv.indexOf("--env-json");
  const env =
    envFileIndex >= 0
      ? JSON.parse(await readFile(process.argv[envFileIndex + 1], "utf8"))
      : process.env;
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)
    throw Error(
      "Storage credentials are required; no credentials were printed.",
    );
  const client = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const bucket = "exercise-illustrations";
  const existing = await client.storage.getBucket(bucket);
  if (existing.error) {
    const created = await client.storage.createBucket(bucket, {
      public: false,
      fileSizeLimit: 10 * 1024 * 1024,
      allowedMimeTypes: ["image/webp", "video/mp4", "text/plain"],
    });
    if (created.error) throw Error(created.error.message);
  } else if (existing.data.public)
    throw Error("Refusing to upload licensed media to a public bucket.");
  for (const item of [...audit, { file: "LICENSE.txt" }]) {
    await access(`${root}/${item.file}`);
    const result = await client.storage
      .from(bucket)
      .upload(`movekit/${item.file}`, await readFile(`${root}/${item.file}`), {
        upsert: true,
        contentType: item.file.endsWith(".mp4")
          ? "video/mp4"
          : item.file.endsWith(".webp")
            ? "image/webp"
            : "text/plain",
        cacheControl: "120",
      });
    if (result.error) throw Error(result.error.message);
  }
  console.log(
    "Uploaded 2 exact exercise visuals and their license to private Storage.",
  );
}
console.log(
  "Prepared 2 licensed exercise videos and optimized posters. Raw media remains outside Git.",
);
