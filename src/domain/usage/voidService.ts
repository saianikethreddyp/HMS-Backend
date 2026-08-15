import { prisma, TX_OPTIONS } from "../../db/prisma.js";
import { DomainError } from "../../lib/errors.js";
import * as usageRepo from "../../repositories/usageRepo.js";
import * as periodRepo from "../../repositories/periodRepo.js";
import * as auditRepo from "../../repositories/auditRepo.js";
import * as cache from "../../lib/cache.js";
import { CARDS_CACHE_PREFIX } from "../membership/cardService.js";
import { REPORTS_CACHE_PREFIX } from "../reporting/reportingService.js";
import { remainingQuota } from "../membership/rules.js";

export async function voidUsage(usageId: string, reason: string, actorId: string) {
  if (!reason.trim()) {
    throw new DomainError("VALIDATION_ERROR", "A void reason is required.");
  }

  return prisma.$transaction(async (tx) => {
    const usage = await usageRepo.findUsageById(tx, usageId);
    if (!usage) throw new DomainError("USAGE_NOT_FOUND", "Usage record not found.");
    if (usage.voidedAt) throw new DomainError("USAGE_ALREADY_VOIDED", "This usage was already voided.");

    const decremented = await periodRepo.tryDecrementQuota(tx, usage.periodId);
    if (!decremented) {
      // quota_used was already 0 for this period, which should not happen for
      // a real recorded usage; fail loudly rather than silently drift.
      throw new DomainError("VALIDATION_ERROR", "Cannot void: period quota is already at zero.");
    }

    const voided = await usageRepo.voidUsage(tx, usageId, { voidedById: actorId, voidReason: reason });

    await auditRepo.writeAuditEvent(tx, {
      actorId,
      action: "USAGE_VOIDED",
      entityType: "service_usage",
      entityId: usageId,
      metadata: {
        reason,
        remainingAfterVoid: remainingQuota(decremented.quota_total, decremented.quota_used),
      },
    });

    return voided;
  }, TX_OPTIONS).then((result) => {
    cache.invalidate(CARDS_CACHE_PREFIX);
    cache.invalidate(REPORTS_CACHE_PREFIX);
    return result;
  });
}
