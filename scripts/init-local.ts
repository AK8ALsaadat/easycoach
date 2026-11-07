import { openDatabase, seedDatabase } from "../lib/local-db.ts";
const db = await openDatabase(process.env.LOCAL_DB_PATH ?? "./data/easycoach");
await seedDatabase(db);
await db.close();
console.log("Local PostgreSQL initialized with synthetic accounts.");
