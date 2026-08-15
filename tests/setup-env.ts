import path from "node:path";

process.loadEnvFile(path.resolve(import.meta.dirname, "../.env"));

// Integration tests call resetDb(), which deletes every row in every table
// before/after each test. Without this guard, tests silently reuse the
// app's own DATABASE_URL -- which, in this project, points at the real
// Neon database -- and wipe all real staff/cards/members/usage history.
// (This happened. Never again: tests must run against a dedicated
// database, and refuse to run at all otherwise.)
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) {
  throw new Error(
    "TEST_DATABASE_URL is not set. Integration tests delete all data in " +
      "every table on every run -- running them against DATABASE_URL would " +
      "wipe real data. Set TEST_DATABASE_URL to a separate database (e.g. " +
      "a Neon branch created just for testing) before running tests.",
  );
}
if (testUrl === process.env.DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL must not be the same as DATABASE_URL -- they must point at different databases.",
  );
}
process.env.DATABASE_URL = testUrl;
