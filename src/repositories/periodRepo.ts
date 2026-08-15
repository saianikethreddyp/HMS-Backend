import type { Prisma, PrismaClient } from "@prisma/client";

type Client = PrismaClient | Prisma.TransactionClient;

export function findActivePeriodByCard(client: Client, cardId: string) {
  return client.membershipPeriod.findFirst({ where: { cardId, status: "ACTIVE" } });
}

export function findPeriodById(client: Client, id: string) {
  return client.membershipPeriod.findUnique({ where: { id } });
}

export function createPeriod(
  client: Client,
  params: {
    cardId: string;
    offerId: string | null;
    pricePaise: number;
    memberLimit: number;
    quotaTotal: number;
    startsOn: Date;
    endsOn: Date;
    issuedById: string;
  },
) {
  return client.membershipPeriod.create({ data: params });
}

export function expirePeriod(client: Client, id: string) {
  return client.membershipPeriod.update({ where: { id }, data: { status: "RENEWED" } });
}

/**
 * Atomically increments quota_used only while it is below quota_total and the
 * period is ACTIVE. Returns the updated row, or null if the guard failed
 * (exhausted, inactive, or missing) -- callers distinguish those cases by a
 * follow-up read.
 */
export async function tryIncrementQuota(client: Client, periodId: string) {
  const rows = await client.$queryRaw<Array<{ id: string; quota_used: number; quota_total: number }>>`
    UPDATE membership_periods
    SET quota_used = quota_used + 1, updated_at = now()
    WHERE id = ${periodId} AND status = 'ACTIVE' AND quota_used < quota_total
    RETURNING id, quota_used, quota_total
  `;
  return rows[0] ?? null;
}

/**
 * Atomically decrements quota_used only while it is above zero. Used when
 * voiding a usage to restore exactly one unit.
 */
export async function tryDecrementQuota(client: Client, periodId: string) {
  const rows = await client.$queryRaw<Array<{ id: string; quota_used: number; quota_total: number }>>`
    UPDATE membership_periods
    SET quota_used = quota_used - 1, updated_at = now()
    WHERE id = ${periodId} AND quota_used > 0
    RETURNING id, quota_used, quota_total
  `;
  return rows[0] ?? null;
}
