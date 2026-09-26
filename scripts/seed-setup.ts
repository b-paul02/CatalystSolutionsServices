// Seeds may only ever touch a LOCAL database. Loads .env.development.local, then refuses anything remote.
import { existsSync } from "node:fs";
import { assertDisposableDatabase, isLocalDb } from "../lib/dbGuard";

if (existsSync(".env.development.local")) process.loadEnvFile(".env.development.local");
if (!isLocalDb(process.env.DATABASE_URL)) throw new Error("Seeds only run against a local database (DATABASE_URL in .env.development.local).");
await assertDisposableDatabase(); // localhost is not proof: the database must also carry the disposable marker
process.env.GROWTHOS_TEST_ADAPTER = "1";
process.env.ASSET_STORAGE ??= "local";
