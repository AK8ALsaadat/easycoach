import { afterAll, beforeAll, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { fixtureDatabase, coach, other } from "./helpers/db";
import { customCatalogEntries, isCustomExercise, catalogSearch, catalog } from "@/lib/catalog";
import { embeddedVideo, formatDuration } from "@/lib/video-links";

let fixture: Awaited<ReturnType<typeof fixtureDatabase>>;
beforeAll(async () => {
  fixture = await fixtureDatabase();
});
afterAll(async () => {
  await (fixture.db as PGlite).close();
});

/** A ready asset owned by the given coach, created the way an upload would. */
async function asset(owner: string) {
  const id = crypto.randomUUID();
  await fixture.db.query(
    "insert into public.media_assets(id,coach_id,filename,path,size,mime,status) values($1,$2,'clip.mp4',$3,1024,'video/mp4','ready')",
    [id, owner, owner + "/" + id],
  );
  return id;
}

it("stores an uploaded clip on a custom exercise and keeps another coach's clip out", async () => {
  const mine = await asset(coach);
  const theirs = await asset(other);

  const saved = await fixture.app<{ id: string; media_id: string | null }>(coach, "exercise_save", {
    name: "سكوات بالبار",
    description: "ظهر مستقيم ونزول ببطء.",
    video: "",
    media_id: mine,
  });
  expect(saved.media_id).toBe(mine);

  // Someone else's asset is ignored rather than attached.
  const borrowed = await fixture.app<{ media_id: string | null }>(coach, "exercise_save", {
    name: "محاولة استعارة",
    description: "",
    video: "",
    media_id: theirs,
  });
  expect(borrowed.media_id).toBeNull();

  // Omitting the key keeps the stored clip; null clears it.
  const kept = await fixture.app<{ media_id: string | null }>(coach, "exercise_save", {
    id: saved.id,
    name: "سكوات بالبار",
    description: "ظهر مستقيم ونزول ببطء.",
    video: "",
  });
  expect(kept.media_id).toBe(mine);
  const cleared = await fixture.app<{ media_id: string | null }>(coach, "exercise_save", {
    id: saved.id,
    name: "سكوات بالبار",
    description: "ظهر مستقيم ونزول ببطء.",
    video: "",
    media_id: null,
  });
  expect(cleared.media_id).toBeNull();
});

it("deletes a custom exercise only for its owner", async () => {
  const saved = await fixture.app<{ id: string }>(coach, "exercise_save", {
    name: "تمرين للحذف",
    description: "",
    video: "",
  });
  await expect(fixture.app(other, "exercise_delete", { id: saved.id })).rejects.toThrow();
  expect(await fixture.app(coach, "exercise_delete", { id: saved.id })).toMatchObject({ id: saved.id });
  const rows = await fixture.db.query("select 1 from public.exercises where id=$1", [saved.id]);
  expect(rows.rows).toHaveLength(0);
});

it("presents coach exercises in the guide and finds them by search", () => {
  const entries = customCatalogEntries([
    { id: "11111111-1111-4111-8111-111111111111", name: "سكوات اختبار", description: "تعليمات", video: "", media_id: null },
  ]);
  expect(entries[0].id).toBe("custom:11111111-1111-4111-8111-111111111111");
  expect(isCustomExercise(entries[0])).toBe(true);
  expect(isCustomExercise(catalog[0])).toBe(false);
  // The same search box that filters the 876 built-in movements.
  expect(catalogSearch(entries[0], "سكوات")).toBe(true);
  expect(catalogSearch(entries[0], "بنش")).toBe(false);
});

it("recognises YouTube links in every shape the coach might paste, and nothing else", () => {
  const forms = [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ",
    "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    "https://www.youtube.com/embed/dQw4w9WgXcQ",
  ];
  for (const url of forms) expect(embeddedVideo(url)?.id).toBe("dQw4w9WgXcQ");
  expect(embeddedVideo("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42")?.embed).toContain("start=42");
  // Not an embed: a plain file link, a non-https link, junk, or a lookalike host.
  for (const url of ["https://example.test/clip.mp4", "http://youtu.be/dQw4w9WgXcQ", "not a url", "https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ"])
    expect(embeddedVideo(url)).toBeNull();
  // Nothing is requested from YouTube before the viewer asks for it.
  expect(embeddedVideo(forms[0])!.embed).not.toContain("autoplay=1");
  expect(embeddedVideo(forms[0])!.embed).toContain("youtube-nocookie.com");
});

it("shows a real duration instead of 0:00", () => {
  expect(formatDuration(0)).toBe("");
  expect(formatDuration(Number.NaN)).toBe("");
  expect(formatDuration(9)).toBe("0:09");
  expect(formatDuration(62)).toBe("1:02");
  expect(formatDuration(3725)).toBe("1:02:05");
});
