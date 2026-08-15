-- CreateIndex
CREATE INDEX "membership_cards_created_at_idx" ON "membership_cards"("created_at");

-- CreateIndex
CREATE INDEX "membership_cards_phone_idx" ON "membership_cards"("phone");

-- CreateIndex
CREATE INDEX "membership_periods_status_idx" ON "membership_periods"("status");

-- CreateIndex
CREATE INDEX "membership_periods_status_ends_on_idx" ON "membership_periods"("status", "ends_on");

-- CreateIndex
CREATE INDEX "service_usages_occurred_at_idx" ON "service_usages"("occurred_at");

-- CreateIndex
CREATE INDEX "service_usages_voided_at_idx" ON "service_usages"("voided_at");
