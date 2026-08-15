import { prisma } from "../../db/prisma.js";
import * as reportRepo from "../../repositories/reportRepo.js";
import * as cache from "../../lib/cache.js";
import { istDayBounds } from "../membership/rules.js";

const EXPIRING_SOON_WINDOW_DAYS = 30;
export const REPORTS_CACHE_PREFIX = "reports:";
const REPORTS_CACHE_TTL_MS = 15_000;

export async function getSummary() {
  return cache.getOrSet(`${REPORTS_CACHE_PREFIX}summary`, REPORTS_CACHE_TTL_MS, computeSummary);
}

async function computeSummary() {
  const now = new Date();
  const { start: todayStart, end: todayEnd } = istDayBounds(now);
  const expiringWindowEnd = new Date(todayStart.getTime() + EXPIRING_SOON_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [
    totalActiveCards,
    totalExpiredCards,
    expiringSoonCards,
    totalMembers,
    todayUsageCount,
    serviceBreakdown,
  ] = await Promise.all([
    reportRepo.countActivePeriods(prisma),
    reportRepo.countNonActivePeriods(prisma),
    reportRepo.countExpiringSoon(prisma, todayStart, expiringWindowEnd),
    reportRepo.countActiveMembers(prisma),
    reportRepo.countUsagesInRange(prisma, todayStart, todayEnd),
    reportRepo.serviceTypeBreakdown(prisma),
  ]);

  const totalTransactions = serviceBreakdown.OP + serviceBreakdown.PHARMACY + serviceBreakdown.DIAGNOSTIC;

  return {
    totalActiveCards,
    totalExpiredCards,
    expiringSoonCards,
    totalMembers,
    todayUsageCount,
    serviceBreakdown,
    totalTransactions,
  };
}
