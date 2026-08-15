import { prisma, TX_OPTIONS } from "../../db/prisma.js";
import { DomainError } from "../../lib/errors.js";
import * as cardRepo from "../../repositories/cardRepo.js";
import * as periodRepo from "../../repositories/periodRepo.js";
import * as memberRepo from "../../repositories/memberRepo.js";
import * as usageRepo from "../../repositories/usageRepo.js";
import * as auditRepo from "../../repositories/auditRepo.js";
import * as cache from "../../lib/cache.js";
import { CARDS_CACHE_PREFIX } from "../membership/cardService.js";
import { REPORTS_CACHE_PREFIX } from "../reporting/reportingService.js";
import { isPeriodExpired, remainingQuota } from "../membership/rules.js";
import type { ServiceType } from "./rules.js";
import type { ListUsagesFilters } from "../../repositories/usageRepo.js";

export type RecordUsageInput = {
  cardId: string;
  memberId: string;
  serviceType: ServiceType;
  idempotencyKey: string;
};

export type RecordUsageResult = {
  usageId: string;
  serviceType: ServiceType;
  before: number;
  after: number;
  quotaTotal: number;
  replayed: boolean;
};

export async function recordUsage(input: RecordUsageInput, actorId: string): Promise<RecordUsageResult> {
  const result = await recordUsageTx(input, actorId);
  if (!result.replayed) {
    cache.invalidate(CARDS_CACHE_PREFIX);
    cache.invalidate(REPORTS_CACHE_PREFIX);
  }
  return result;
}

async function recordUsageTx(input: RecordUsageInput, actorId: string): Promise<RecordUsageResult> {
  return prisma.$transaction(
    async (tx) => {
      const existing = await usageRepo.findUsageByIdempotencyKey(tx, input.idempotencyKey);
      if (existing) {
        if (
          existing.cardId !== input.cardId ||
          existing.memberId !== input.memberId ||
          existing.serviceType !== input.serviceType
        ) {
          throw new DomainError(
            "IDEMPOTENCY_CONFLICT",
            "This idempotency key was already used for a different request.",
          );
        }
        const period = await periodRepo.findPeriodById(tx, existing.periodId);
        const quotaTotal = period?.quotaTotal ?? 0;
        const quotaUsedAfter = period?.quotaUsed ?? 0;
        return {
          usageId: existing.id,
          serviceType: existing.serviceType,
          before: quotaTotal - quotaUsedAfter + 1,
          after: remainingQuota(quotaTotal, quotaUsedAfter),
          quotaTotal,
          replayed: true,
        };
      }

      const card = await cardRepo.findCardById(tx, input.cardId);
      if (!card) throw new DomainError("CARD_NOT_FOUND", "Card not found.");
      if (card.status !== "ACTIVE") throw new DomainError("CARD_INACTIVE", "Card is not active.");

      const period = await periodRepo.findActivePeriodByCard(tx, input.cardId);
      if (!period) throw new DomainError("PERIOD_NOT_FOUND", "Card has no active membership period.");
      if (isPeriodExpired(period.endsOn, new Date())) {
        throw new DomainError("PERIOD_EXPIRED", "The current membership period has expired.");
      }

      const member = await memberRepo.findMemberById(tx, input.memberId);
      if (!member || member.cardId !== input.cardId || member.status !== "ACTIVE") {
        throw new DomainError("MEMBER_INELIGIBLE", "Member is not an active member of this card.");
      }

      const before = remainingQuota(period.quotaTotal, period.quotaUsed);

      const incremented = await periodRepo.tryIncrementQuota(tx, period.id);
      if (!incremented) {
        throw new DomainError("QUOTA_EXHAUSTED", "No shared uses remain on this card's current period.");
      }

      const usage = await usageRepo.createUsage(tx, {
        periodId: period.id,
        cardId: input.cardId,
        memberId: input.memberId,
        serviceType: input.serviceType,
        recordedById: actorId,
        idempotencyKey: input.idempotencyKey,
      });

      const after = remainingQuota(incremented.quota_total, incremented.quota_used);

      await auditRepo.writeAuditEvent(tx, {
        actorId,
        action: "USAGE_RECORDED",
        entityType: "service_usage",
        entityId: usage.id,
        metadata: { cardId: input.cardId, memberId: input.memberId, serviceType: input.serviceType, before, after },
      });

      return {
        usageId: usage.id,
        serviceType: input.serviceType,
        before,
        after,
        quotaTotal: incremented.quota_total,
        replayed: false,
      };
    },
    TX_OPTIONS,
  );
}

export async function listUsages(filters: ListUsagesFilters) {
  const { usages, total } = await usageRepo.listUsages(prisma, filters);
  return { usages, total, page: filters.page, limit: filters.limit };
}
