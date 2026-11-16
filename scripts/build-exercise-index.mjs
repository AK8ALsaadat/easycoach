// Keep display-only program views independent of the full exercise picker data.
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const source = JSON.parse(readFileSync("lib/exercise-data/exercises.json", "utf8"));
const index = Object.fromEntries(source.map(({ id, name }) => [id, name]));
const target = "lib/exercise-data/names.json";
if (process.argv.includes("--check")) {
  assert.deepEqual(JSON.parse(readFileSync(target, "utf8")), index, "Exercise name index is stale; run node scripts/build-exercise-index.mjs");
} else writeFileSync(target, JSON.stringify(index, null, 2) + "\n");
console.log(`${source.length} exercise names ${process.argv.includes("--check") ? "verified" : "generated"}`);
