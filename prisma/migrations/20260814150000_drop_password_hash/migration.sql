-- Single-portal admin-only tool: login no longer checks a password.
ALTER TABLE "staff_users" DROP COLUMN "password_hash";
