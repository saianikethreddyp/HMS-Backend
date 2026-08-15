-- Drop the plain index on phone; the unique index below covers the same
-- column and supersedes it.
DROP INDEX "membership_cards_phone_idx";

-- CreateIndex
CREATE UNIQUE INDEX "membership_cards_phone_key" ON "membership_cards"("phone");
