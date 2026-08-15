-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('ADMIN', 'STAFF');

-- CreateEnum
CREATE TYPE "CardStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "PeriodStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'RENEWED');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('OP', 'PHARMACY', 'DIAGNOSTIC');

-- CreateTable
CREATE TABLE "staff_users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL DEFAULT 'STAFF',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "staff_user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_offers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price_paise" INTEGER NOT NULL,
    "validity_months" INTEGER NOT NULL,
    "member_limit" INTEGER NOT NULL,
    "quota_total" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membership_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_cards" (
    "id" TEXT NOT NULL,
    "card_number" TEXT NOT NULL,
    "status" "CardStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membership_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_periods" (
    "id" TEXT NOT NULL,
    "card_id" TEXT NOT NULL,
    "offer_id" TEXT,
    "price_paise" INTEGER NOT NULL,
    "member_limit" INTEGER NOT NULL,
    "quota_total" INTEGER NOT NULL,
    "quota_used" INTEGER NOT NULL DEFAULT 0,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "status" "PeriodStatus" NOT NULL DEFAULT 'ACTIVE',
    "issued_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membership_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "family_members" (
    "id" TEXT NOT NULL,
    "card_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "phone" TEXT,
    "date_of_birth" DATE,
    "gender" TEXT,
    "status" "MemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "family_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_usages" (
    "id" TEXT NOT NULL,
    "membership_period_id" TEXT NOT NULL,
    "card_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "service_type" "ServiceType" NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_by" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "voided_at" TIMESTAMP(3),
    "voided_by" TEXT,
    "void_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "metadata" JSONB,
    "correlation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_users_login_key" ON "staff_users"("login");

-- CreateIndex
CREATE INDEX "sessions_staff_user_id_idx" ON "sessions"("staff_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "membership_cards_card_number_key" ON "membership_cards"("card_number");

-- CreateIndex
CREATE INDEX "membership_periods_card_id_idx" ON "membership_periods"("card_id");

-- CreateIndex
CREATE INDEX "family_members_card_id_idx" ON "family_members"("card_id");

-- CreateIndex
CREATE UNIQUE INDEX "service_usages_idempotency_key_key" ON "service_usages"("idempotency_key");

-- CreateIndex
CREATE INDEX "service_usages_membership_period_id_idx" ON "service_usages"("membership_period_id");

-- CreateIndex
CREATE INDEX "service_usages_card_id_occurred_at_idx" ON "service_usages"("card_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_events_entity_type_entity_id_idx" ON "audit_events"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "staff_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_periods" ADD CONSTRAINT "membership_periods_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "membership_cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_periods" ADD CONSTRAINT "membership_periods_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "membership_offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_periods" ADD CONSTRAINT "membership_periods_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_members" ADD CONSTRAINT "family_members_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "membership_cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_usages" ADD CONSTRAINT "service_usages_membership_period_id_fkey" FOREIGN KEY ("membership_period_id") REFERENCES "membership_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_usages" ADD CONSTRAINT "service_usages_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "membership_cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_usages" ADD CONSTRAINT "service_usages_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "family_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_usages" ADD CONSTRAINT "service_usages_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_usages" ADD CONSTRAINT "service_usages_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "staff_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "staff_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Domain invariants the database enforces directly.

-- At most one ACTIVE membership period per card.
CREATE UNIQUE INDEX "one_active_period_per_card" ON "membership_periods"("card_id") WHERE "status" = 'ACTIVE';

-- Quota bounds: 0 <= quota_used <= quota_total, quota_total > 0.
ALTER TABLE "membership_periods" ADD CONSTRAINT "membership_periods_quota_bounds"
  CHECK ("quota_used" >= 0 AND "quota_used" <= "quota_total" AND "quota_total" > 0);

-- Period end must not precede start.
ALTER TABLE "membership_periods" ADD CONSTRAINT "membership_periods_valid_dates"
  CHECK ("ends_on" >= "starts_on");

-- Void metadata is all-or-nothing.
ALTER TABLE "service_usages" ADD CONSTRAINT "service_usages_void_consistency"
  CHECK (
    ("voided_at" IS NULL AND "voided_by" IS NULL AND "void_reason" IS NULL)
    OR ("voided_at" IS NOT NULL AND "voided_by" IS NOT NULL AND "void_reason" IS NOT NULL)
  );

-- membership_offers pricing/quota sanity.
ALTER TABLE "membership_offers" ADD CONSTRAINT "membership_offers_positive_values"
  CHECK ("price_paise" >= 0 AND "validity_months" > 0 AND "member_limit" > 0 AND "quota_total" > 0);
