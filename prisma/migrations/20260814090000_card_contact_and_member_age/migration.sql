-- Add new columns as nullable first so existing rows can be backfilled.
ALTER TABLE "membership_cards" ADD COLUMN "village" TEXT;
ALTER TABLE "membership_cards" ADD COLUMN "phone" TEXT;
ALTER TABLE "family_members" ADD COLUMN "age" INTEGER;

-- Backfill existing dev/test rows with placeholders (see README: this DB
-- holds only synthetic/test data, never real hospital records).
UPDATE "membership_cards" SET "village" = 'UNKNOWN', "phone" = '0000000000' WHERE "village" IS NULL;
UPDATE "family_members" SET "age" = 0 WHERE "age" IS NULL;
UPDATE "family_members" SET "gender" = 'UNKNOWN' WHERE "gender" IS NULL;

-- Now enforce NOT NULL.
ALTER TABLE "membership_cards" ALTER COLUMN "village" SET NOT NULL;
ALTER TABLE "membership_cards" ALTER COLUMN "phone" SET NOT NULL;
ALTER TABLE "family_members" ALTER COLUMN "age" SET NOT NULL;
ALTER TABLE "family_members" ALTER COLUMN "gender" SET NOT NULL;

-- Drop the fields the client no longer wants collected per member.
ALTER TABLE "family_members" DROP COLUMN "date_of_birth";
ALTER TABLE "family_members" DROP COLUMN "phone";
ALTER TABLE "family_members" DROP COLUMN "relation";

-- Domain invariant: age must be a plausible human age.
ALTER TABLE "family_members" ADD CONSTRAINT "family_members_age_bounds"
  CHECK ("age" >= 0 AND "age" <= 120);
