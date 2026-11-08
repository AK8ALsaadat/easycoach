import { it, expect } from "vitest";
import {
  openDatabase,
  rpcLocal,
  LOCAL_IDS,
  passwordHash,
} from "@/lib/local-db";
import { ensureLocalDemo } from "@/lib/local-demo";
import { DEMO_EMAIL, demoCredentials, isDemoIdentity } from "@/lib/demo-config";
import type { Snapshot } from "@/lib/model";
it("accepts only the public demo credentials and requires the server-owned demo marker", () => {
  expect(
    demoCredentials.safeParse({ username: "test", password: "test" }).success,
  ).toBe(true);
  expect(
    demoCredentials.safeParse({ username: "admin", password: "test" }).success,
  ).toBe(false);
  expect(
    demoCredentials.safeParse({ username: "test", password: "wrong" }).success,
  ).toBe(false);
  expect(isDemoIdentity(DEMO_EMAIL, { demo: true })).toBe(true);
  expect(isDemoIdentity(DEMO_EMAIL, {})).toBe(false);
  expect(isDemoIdentity("owner@example.test", { demo: true })).toBe(false);
});
it("creates a persistent separate demo trainer and cannot read or change another trainer's client", async () => {
  const db = await openDatabase();
  try {
    await db.query("insert into auth.users values($1,$2,$3,now())", [
      LOCAL_IDS.coach,
      "owner@example.test",
      passwordHash("RealOwnerTest!2026"),
    ]);
    await rpcLocal(db, LOCAL_IDS.coach, "init_profile", {
      display_name: "Owner",
      requested_role: "coach",
    });
    const real = await rpcLocal<{ id: string }>(
      db,
      LOCAL_IDS.coach,
      "app_command",
      {
        command: "client_save",
        payload: {
          name: "Private owner client",
          email: "private@example.test",
          phone: "",
        },
      },
    );
    const demo = await ensureLocalDemo(db);
    expect(await ensureLocalDemo(db)).toBe(demo);
    const snapshot = await rpcLocal<Snapshot>(db, demo, "management_snapshot");
    expect(snapshot.profile!.name).toBe("test");
    expect(snapshot.profile!.role).toBe("coach");
    expect(snapshot.clients).toEqual([]);
    await expect(
      rpcLocal(db, demo, "app_command", {
        command: "client_save",
        payload: {
          id: real.id,
          name: "Forged",
          email: "private@example.test",
          phone: "",
        },
      }),
    ).rejects.toThrow();
    expect(
      (await rpcLocal<Snapshot>(db, LOCAL_IDS.coach, "management_snapshot"))
        .clients[0].name,
    ).toBe("Private owner client");
  } finally {
    await db.close();
  }
});
