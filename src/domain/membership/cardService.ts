import { prisma, TX_OPTIONS } from "../../db/prisma.js";
import { DomainError } from "../../lib/errors.js";
import * as cardRepo from "../../repositories/cardRepo.js";
import * as periodRepo from "../../repositories/periodRepo.js";
import * as memberRepo from "../../repositories/memberRepo.js";
import * as offerRepo from "../../repositories/offerRepo.js";
import * as auditRepo from "../../repositories/auditRepo.js";
import * as cache from "../../lib/cache.js";
import { computePeriodEnd, toDateOnly, isPeriodExpired, remainingQuota } from "./rules.js";
import { generateCardNumber } from "./cardNumber.js";

// Read paths cached here (search, browse, detail) are informational
// projections, never the atomic quota-transaction path, so a short TTL plus
// invalidation on every card/member/usage mutation keeps them safe.
export const CARDS_CACHE_PREFIX = "cards:";
const CARDS_CACHE_TTL_MS = 15_000;

export type IssueCardInput = {
  village: string;
  phone: string;
  offerId?: string;
  startsOn?: Date;
  members: Array<{
    name: string;
    age: number;
    gender: string;
  }>;
};

const MAX_CARD_NUMBER_ATTEMPTS = 5;

async function reserveUniqueCardNumber(): Promise<string> {
  for (let attempt = 0; attempt < MAX_CARD_NUMBER_ATTEMPTS; attempt++) {
    const candidate = generateCardNumber();
    const existing = await cardRepo.findCardByNumber(prisma, candidate);
    if (!existing) return candidate;
  }
  throw new DomainError("CARD_NUMBER_TAKEN", "Could not generate a unique card number. Try again.");
}

export async function issueCard(input: IssueCardInput, actorId: string) {
  const offer = input.offerId
    ? await offerRepo.findActiveOfferById(prisma, input.offerId)
    : await offerRepo.findDefaultActiveOffer(prisma);
  if (!offer) {
    throw new DomainError("OFFER_NOT_FOUND", "No active membership offer is configured.");
  }

  if (input.members.length !== offer.memberLimit) {
    throw new DomainError(
      "MEMBER_LIMIT_REACHED",
      `Exactly ${offer.memberLimit} members are required to register this card.`,
    );
  }

  const startsOn = toDateOnly(input.startsOn ?? new Date());
  const endsOn = computePeriodEnd(startsOn, offer.validityMonths);

  // Reserve the card number outside the transaction (a uniqueness pre-check,
  // not a hard reservation); the insert's own unique constraint is the real
  // guard against a race, and a collision there simply fails this attempt.
  const cardNumber = await reserveUniqueCardNumber();

  return prisma.$transaction(async (tx) => {
    const card = await cardRepo.createCard(tx, { cardNumber, village: input.village, phone: input.phone });

    const period = await periodRepo.createPeriod(tx, {
      cardId: card.id,
      offerId: offer.id,
      pricePaise: offer.pricePaise,
      memberLimit: offer.memberLimit,
      quotaTotal: offer.quotaTotal,
      startsOn,
      endsOn,
      issuedById: actorId,
    });

    const members = [];
    for (const m of input.members) {
      members.push(
        await memberRepo.createMember(tx, {
          cardId: card.id,
          name: m.name,
          age: m.age,
          gender: m.gender,
        }),
      );
    }

    await auditRepo.writeAuditEvent(tx, {
      actorId,
      action: "CARD_ISSUED",
      entityType: "membership_card",
      entityId: card.id,
      metadata: { periodId: period.id, offerId: offer.id, memberCount: members.length },
    });

    return { card, period, members };
  }, TX_OPTIONS).then((result) => {
    cache.invalidate(CARDS_CACHE_PREFIX);
    return result;
  });
}

export async function renewCard(cardId: string, actorId: string, opts?: { offerId?: string }) {
  const card = await cardRepo.findCardById(prisma, cardId);
  if (!card) throw new DomainError("CARD_NOT_FOUND", "Card not found.");
  if (card.status !== "ACTIVE") throw new DomainError("CARD_INACTIVE", "Card is not active.");

  const currentPeriod = await periodRepo.findActivePeriodByCard(prisma, cardId);

  // Renewing while the current period is still valid and has uses left
  // discards those unused uses and resets the clock early -- only allow it
  // once the quota is exhausted or the period has actually expired.
  if (currentPeriod) {
    const expired = isPeriodExpired(currentPeriod.endsOn, new Date());
    const remaining = remainingQuota(currentPeriod.quotaTotal, currentPeriod.quotaUsed);
    if (!expired && remaining > 0) {
      throw new DomainError(
        "RENEWAL_NOT_ELIGIBLE",
        `This card still has ${remaining} shared use${remaining === 1 ? "" : "s"} remaining and is valid until ${currentPeriod.endsOn.toISOString().slice(0, 10)}. Renewal is only available once the quota is used up or the period has expired.`,
      );
    }
  }

  const offer = opts?.offerId
    ? await offerRepo.findActiveOfferById(prisma, opts.offerId)
    : currentPeriod?.offerId
      ? await offerRepo.findActiveOfferById(prisma, currentPeriod.offerId)
      : await offerRepo.findDefaultActiveOffer(prisma);
  if (!offer) throw new DomainError("OFFER_NOT_FOUND", "No active membership offer is configured.");

  const startsOn = toDateOnly(new Date());
  const endsOn = computePeriodEnd(startsOn, offer.validityMonths);

  return prisma.$transaction(async (tx) => {
    if (currentPeriod) {
      await periodRepo.expirePeriod(tx, currentPeriod.id);
    }

    const period = await periodRepo.createPeriod(tx, {
      cardId,
      offerId: offer.id,
      pricePaise: offer.pricePaise,
      memberLimit: offer.memberLimit,
      quotaTotal: offer.quotaTotal,
      startsOn,
      endsOn,
      issuedById: actorId,
    });

    await auditRepo.writeAuditEvent(tx, {
      actorId,
      action: "CARD_RENEWED",
      entityType: "membership_card",
      entityId: cardId,
      metadata: { previousPeriodId: currentPeriod?.id ?? null, newPeriodId: period.id },
    });

    return period;
  }, TX_OPTIONS).then((result) => {
    cache.invalidate(CARDS_CACHE_PREFIX);
    return result;
  });
}

export async function getCardDetail(cardId: string) {
  const card = await cache.getOrSet(`${CARDS_CACHE_PREFIX}detail:${cardId}`, CARDS_CACHE_TTL_MS, () =>
    cardRepo.findCardDetail(prisma, cardId),
  );
  if (!card) throw new DomainError("CARD_NOT_FOUND", "Card not found.");
  return card;
}

export async function searchCards(query: string) {
  return cache.getOrSet(`${CARDS_CACHE_PREFIX}search:${query}`, CARDS_CACHE_TTL_MS, () =>
    cardRepo.searchCards(prisma, query),
  );
}

export async function listCards(filters: { from?: Date; to?: Date; page?: number; limit?: number }) {
  const key = `${CARDS_CACHE_PREFIX}list:${filters.from?.toISOString() ?? ""}:${filters.to?.toISOString() ?? ""}:${filters.page ?? ""}:${filters.limit ?? ""}`;
  return cache.getOrSet(key, CARDS_CACHE_TTL_MS, () => cardRepo.listCards(prisma, filters));
}
