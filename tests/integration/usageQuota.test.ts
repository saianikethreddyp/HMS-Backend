import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../src/db/prisma.js";
import { recordUsage } from "../../src/domain/usage/usageService.js";
import { voidUsage } from "../../src/domain/usage/voidService.js";
import { renewCard } from "../../src/domain/membership/cardService.js";
import { DomainError } from "../../src/lib/errors.js";
import { createCardWithActivePeriod, createStaff, resetDb } from "./helpers.js";

beforeEach(resetDb);
afterAll(async () => {
  await resetDb();
  await prisma.$disconnect();
});

describe("recordUsage", () => {
  it("a new period has 20 remaining and each service type consumes one shared unit", async () => {
    const { staff } = await createStaff();
    const { card, member } = await createCardWithActivePeriod({ issuedById: staff.id });

    const op = await recordUsage(
      { cardId: card.id, memberId: member.id, serviceType: "OP", idempotencyKey: randomUUID() },
      staff.id,
    );
    expect(op.before).toBe(20);
    expect(op.after).toBe(19);

    const pharmacy = await recordUsage(
      { cardId: card.id, memberId: member.id, serviceType: "PHARMACY", idempotencyKey: randomUUID() },
      staff.id,
    );
    expect(pharmacy.after).toBe(18);

    const diagnostic = await recordUsage(
      { cardId: card.id, memberId: member.id, serviceType: "DIAGNOSTIC", idempotencyKey: randomUUID() },
      staff.id,
    );
    expect(diagnostic.after).toBe(17);
  });

  it("the 19th use leaves one and the 20th leaves zero", async () => {
    const { staff } = await createStaff();
    const { card, member } = await createCardWithActivePeriod({ issuedById: staff.id, quotaUsed: 18 });

    const nineteenth = await recordUsage(
      { cardId: card.id, memberId: member.id, serviceType: "OP", idempotencyKey: randomUUID() },
      staff.id,
    );
    expect(nineteenth.after).toBe(1);

    const twentieth = await recordUsage(
      { cardId: card.id, memberId: member.id, serviceType: "OP", idempotencyKey: randomUUID() },
      staff.id,
    );
    expect(twentieth.after).toBe(0);
  });

  it("the 21st use is rejected without state change", async () => {
    const { staff } = await createStaff();
    const { card, member, period } = await createCardWithActivePeriod({ issuedById: staff.id, quotaUsed: 20 });

    await expect(
      recordUsage(
        { cardId: card.id, memberId: member.id, serviceType: "OP", idempotencyKey: randomUUID() },
        staff.id,
      ),
    ).rejects.toMatchObject({ code: "QUOTA_EXHAUSTED" });

    const reloaded = await prisma.membershipPeriod.findUniqueOrThrow({ where: { id: period.id } });
    expect(reloaded.quotaUsed).toBe(20);
    const usageCount = await prisma.serviceUsage.count({ where: { periodId: period.id } });
    expect(usageCount).toBe(0);
  });

  it("rejects usage on an expired period", async () => {
    const { staff } = await createStaff();
    const past = new Date();
    past.setUTCFullYear(past.getUTCFullYear() - 2);
    const { card, member } = await createCardWithActivePeriod({
      issuedById: staff.id,
      startsOn: past,
    });

    await expect(
      recordUsage(
        { cardId: card.id, memberId: member.id, serviceType: "OP", idempotencyKey: randomUUID() },
        staff.id,
      ),
    ).rejects.toMatchObject({ code: "PERIOD_EXPIRED" });
  });

  it("rejects usage for an ineligible (inactive) member", async () => {
    const { staff } = await createStaff();
    const { card, member } = await createCardWithActivePeriod({ issuedById: staff.id });
    await prisma.familyMember.update({ where: { id: member.id }, data: { status: "INACTIVE" } });

    await expect(
      recordUsage(
        { cardId: card.id, memberId: member.id, serviceType: "OP", idempotencyKey: randomUUID() },
        staff.id,
      ),
    ).rejects.toMatchObject({ code: "MEMBER_INELIGIBLE" });
  });

  it("an identical idempotency-key retry returns one usage and one deduction", async () => {
    const { staff } = await createStaff();
    const { card, member, period } = await createCardWithActivePeriod({ issuedById: staff.id });
    const key = randomUUID();
    const input = { cardId: card.id, memberId: member.id, serviceType: "OP" as const, idempotencyKey: key };

    const first = await recordUsage(input, staff.id);
    const second = await recordUsage(input, staff.id);

    expect(first.usageId).toBe(second.usageId);
    expect(second.replayed).toBe(true);

    const usageCount = await prisma.serviceUsage.count({ where: { periodId: period.id } });
    expect(usageCount).toBe(1);
    const reloaded = await prisma.membershipPeriod.findUniqueOrThrow({ where: { id: period.id } });
    expect(reloaded.quotaUsed).toBe(1);
  });

  it("rejects reuse of the same idempotency key with a different payload", async () => {
    const { staff } = await createStaff();
    const { card, member } = await createCardWithActivePeriod({ issuedById: staff.id });
    const key = randomUUID();

    await recordUsage(
      { cardId: card.id, memberId: member.id, serviceType: "OP", idempotencyKey: key },
      staff.id,
    );

    await expect(
      recordUsage(
        { cardId: card.id, memberId: member.id, serviceType: "PHARMACY", idempotencyKey: key },
        staff.id,
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("two concurrent requests for the final use yield exactly one success", async () => {
    const { staff } = await createStaff();
    const { card, member, period } = await createCardWithActivePeriod({ issuedById: staff.id, quotaUsed: 19 });

    const results = await Promise.allSettled([
      recordUsage(
        { cardId: card.id, memberId: member.id, serviceType: "OP", idempotencyKey: randomUUID() },
        staff.id,
      ),
      recordUsage(
        { cardId: card.id, memberId: member.id, serviceType: "PHARMACY", idempotencyKey: randomUUID() },
        staff.id,
      ),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ code: "QUOTA_EXHAUSTED" });

    const reloaded = await prisma.membershipPeriod.findUniqueOrThrow({ where: { id: period.id } });
    expect(reloaded.quotaUsed).toBe(20);
  });
});

describe("voidUsage", () => {
  it("restores one use, requires a reason, and cannot be replayed", async () => {
    const { staff } = await createStaff({ role: "ADMIN" });
    const { card, member, period } = await createCardWithActivePeriod({ issuedById: staff.id });
    const usage = await recordUsage(
      { cardId: card.id, memberId: member.id, serviceType: "OP", idempotencyKey: randomUUID() },
      staff.id,
    );

    await expect(voidUsage(usage.usageId, "", staff.id)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    await voidUsage(usage.usageId, "Recorded by mistake", staff.id);
    const reloaded = await prisma.membershipPeriod.findUniqueOrThrow({ where: { id: period.id } });
    expect(reloaded.quotaUsed).toBe(0);

    await expect(voidUsage(usage.usageId, "Again", staff.id)).rejects.toMatchObject({
      code: "USAGE_ALREADY_VOIDED",
    });

    const reloadedAgain = await prisma.membershipPeriod.findUniqueOrThrow({ where: { id: period.id } });
    expect(reloadedAgain.quotaUsed).toBe(0);
  });
});

describe("renewCard", () => {
  it("starts a fresh quota while preserving prior period history, once the quota is exhausted", async () => {
    const { staff } = await createStaff({ role: "ADMIN" });
    const { card, member, period: oldPeriod } = await createCardWithActivePeriod({ issuedById: staff.id, quotaUsed: 19 });
    await recordUsage(
      { cardId: card.id, memberId: member.id, serviceType: "OP", idempotencyKey: randomUUID() },
      staff.id,
    );

    const newPeriod = await renewCard(card.id, staff.id);
    expect(newPeriod.quotaUsed).toBe(0);
    expect(newPeriod.quotaTotal).toBe(20);
    expect(newPeriod.id).not.toBe(oldPeriod.id);

    const reloadedOld = await prisma.membershipPeriod.findUniqueOrThrow({ where: { id: oldPeriod.id } });
    expect(reloadedOld.status).toBe("RENEWED");
    expect(reloadedOld.quotaUsed).toBe(20);

    const usagesStillLinkedToOldPeriod = await prisma.serviceUsage.count({ where: { periodId: oldPeriod.id } });
    expect(usagesStillLinkedToOldPeriod).toBe(1);
  });

  it("prevents overlapping active periods for one card", async () => {
    const { staff } = await createStaff({ role: "ADMIN" });
    const { card } = await createCardWithActivePeriod({ issuedById: staff.id, quotaUsed: 20 });

    await renewCard(card.id, staff.id);

    const activePeriods = await prisma.membershipPeriod.count({ where: { cardId: card.id, status: "ACTIVE" } });
    expect(activePeriods).toBe(1);
  });

  it("rejects a card that does not exist", async () => {
    const { staff } = await createStaff({ role: "ADMIN" });
    await expect(renewCard(randomUUID(), staff.id)).rejects.toMatchObject({ code: "CARD_NOT_FOUND" });
  });

  it("rejects renewal while the current period still has quota left and has not expired", async () => {
    const { staff } = await createStaff({ role: "ADMIN" });
    const { card } = await createCardWithActivePeriod({ issuedById: staff.id, quotaUsed: 5 });

    await expect(renewCard(card.id, staff.id)).rejects.toMatchObject({ code: "RENEWAL_NOT_ELIGIBLE" });

    const activePeriods = await prisma.membershipPeriod.count({ where: { cardId: card.id, status: "ACTIVE" } });
    expect(activePeriods).toBe(1);
  });

  it("allows renewal once the period has expired, even with quota remaining", async () => {
    const { staff } = await createStaff({ role: "ADMIN" });
    const pastStart = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const pastEnd = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const { card, period: oldPeriod } = await createCardWithActivePeriod({
      issuedById: staff.id,
      quotaUsed: 2,
      startsOn: pastStart,
      endsOn: pastEnd,
    });

    const newPeriod = await renewCard(card.id, staff.id);
    expect(newPeriod.id).not.toBe(oldPeriod.id);
    expect(newPeriod.quotaUsed).toBe(0);
  });
});

describe("DomainError", () => {
  it("exposes a stable code and HTTP status", () => {
    const err = new DomainError("QUOTA_EXHAUSTED");
    expect(err.code).toBe("QUOTA_EXHAUSTED");
    expect(err.status).toBe(409);
  });
});
