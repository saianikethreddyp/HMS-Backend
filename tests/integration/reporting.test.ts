import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../src/db/prisma.js";
import { recordUsage } from "../../src/domain/usage/usageService.js";
import { voidUsage } from "../../src/domain/usage/voidService.js";
import { listUsages } from "../../src/domain/usage/usageService.js";
import { getSummary } from "../../src/domain/reporting/reportingService.js";
import { createCardWithActivePeriod, createStaff, resetDb } from "./helpers.js";

beforeEach(resetDb);
afterAll(async () => {
  await resetDb();
  await prisma.$disconnect();
});

async function seedLedger() {
  const { staff } = await createStaff({ role: "ADMIN" });
  const { card, member } = await createCardWithActivePeriod({ issuedById: staff.id });

  const op = await recordUsage(
    { cardId: card.id, memberId: member.id, serviceType: "OP", idempotencyKey: randomUUID() },
    staff.id,
  );
  await recordUsage(
    { cardId: card.id, memberId: member.id, serviceType: "PHARMACY", idempotencyKey: randomUUID() },
    staff.id,
  );
  const diagnosticToVoid = await recordUsage(
    { cardId: card.id, memberId: member.id, serviceType: "DIAGNOSTIC", idempotencyKey: randomUUID() },
    staff.id,
  );
  await voidUsage(diagnosticToVoid.usageId, "recorded in error", staff.id);

  return { staff, card, member, op };
}

// seedLedger runs four sequential remote transactions (each with its own
// network round trips); the default 20s per-test timeout is too tight for
// that over the pooled Neon connection used in this environment.
const SEED_LEDGER_TIMEOUT = 60000;

describe("listUsages", () => {
  it(
    "filters by card number and service type, and paginates",
    async () => {
      const { card } = await seedLedger();

      const allForCard = await listUsages({ cardNumber: card.cardNumber, page: 1, limit: 20 });
      expect(allForCard.total).toBe(3);

      const opOnly = await listUsages({
        cardNumber: card.cardNumber,
        serviceType: "OP",
        page: 1,
        limit: 20,
      });
      expect(opOnly.total).toBe(1);
      expect(opOnly.usages[0]!.serviceType).toBe("OP");

      const page1 = await listUsages({ cardNumber: card.cardNumber, page: 1, limit: 2 });
      expect(page1.usages).toHaveLength(2);
      expect(page1.total).toBe(3);
    },
    SEED_LEDGER_TIMEOUT,
  );

  it(
    "excludes voided usages when includeVoided is false",
    async () => {
      const { card } = await seedLedger();

      const withVoided = await listUsages({ cardNumber: card.cardNumber, page: 1, limit: 20 });
      expect(withVoided.total).toBe(3);

      const withoutVoided = await listUsages({
        cardNumber: card.cardNumber,
        includeVoided: false,
        page: 1,
        limit: 20,
      });
      expect(withoutVoided.total).toBe(2);
      expect(withoutVoided.usages.every((u) => u.voidedAt === null)).toBe(true);
    },
    SEED_LEDGER_TIMEOUT,
  );
});

describe("getSummary", () => {
  it(
    "reconciles against direct database counts",
    async () => {
      await seedLedger();

      const summary = await getSummary();

      const [activePeriods, members, nonVoidedUsages] = await Promise.all([
        prisma.membershipPeriod.count({ where: { status: "ACTIVE" } }),
        prisma.familyMember.count({ where: { status: "ACTIVE" } }),
        prisma.serviceUsage.count({ where: { voidedAt: null } }),
      ]);

      expect(summary.totalActiveCards).toBe(activePeriods);
      expect(summary.totalMembers).toBe(members);
      expect(summary.totalTransactions).toBe(nonVoidedUsages);
      // OP + PHARMACY recorded, DIAGNOSTIC voided and excluded.
      expect(summary.serviceBreakdown).toEqual({ OP: 1, PHARMACY: 1, DIAGNOSTIC: 0 });
      expect(summary.todayUsageCount).toBe(2);
      // Both non-voided usages were recorded against the same card, so the
      // distinct-card count should be 1 even though the usage count is 2.
      expect(summary.cardsUsedToday).toBe(1);
    },
    SEED_LEDGER_TIMEOUT,
  );
});
