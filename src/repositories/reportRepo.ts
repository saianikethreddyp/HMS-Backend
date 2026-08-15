import type { Prisma, PrismaClient } from "@prisma/client";

type Client = PrismaClient | Prisma.TransactionClient;

export function countActivePeriods(client: Client) {
  return client.membershipPeriod.count({ where: { status: "ACTIVE" } });
}

export function countNonActivePeriods(client: Client) {
  return client.membershipPeriod.count({ where: { status: { not: "ACTIVE" } } });
}

export function countExpiringSoon(client: Client, from: Date, to: Date) {
  return client.membershipPeriod.count({
    where: { status: "ACTIVE", endsOn: { gte: from, lte: to } },
  });
}

export function countActiveMembers(client: Client) {
  return client.familyMember.count({ where: { status: "ACTIVE" } });
}

export function countUsagesInRange(client: Client, start: Date, end: Date) {
  return client.serviceUsage.count({
    where: { voidedAt: null, occurredAt: { gte: start, lt: end } },
  });
}

export async function serviceTypeBreakdown(client: Client) {
  const rows = await client.serviceUsage.groupBy({
    by: ["serviceType"],
    where: { voidedAt: null },
    _count: { _all: true },
  });
  const breakdown = { OP: 0, PHARMACY: 0, DIAGNOSTIC: 0 };
  for (const row of rows) {
    breakdown[row.serviceType] = row._count._all;
  }
  return breakdown;
}
