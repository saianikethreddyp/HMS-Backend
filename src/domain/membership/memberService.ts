import { prisma, TX_OPTIONS } from "../../db/prisma.js";
import { DomainError } from "../../lib/errors.js";
import * as cardRepo from "../../repositories/cardRepo.js";
import * as periodRepo from "../../repositories/periodRepo.js";
import * as memberRepo from "../../repositories/memberRepo.js";
import * as auditRepo from "../../repositories/auditRepo.js";
import * as cache from "../../lib/cache.js";
import { CARDS_CACHE_PREFIX } from "./cardService.js";
import { canAddMember } from "./rules.js";

export type AddMemberInput = {
  name: string;
  age: number;
  gender: string;
};

export async function addMember(cardId: string, input: AddMemberInput, actorId: string) {
  const card = await cardRepo.findCardById(prisma, cardId);
  if (!card) throw new DomainError("CARD_NOT_FOUND", "Card not found.");
  if (card.status !== "ACTIVE") throw new DomainError("CARD_INACTIVE", "Card is not active.");

  const period = await periodRepo.findActivePeriodByCard(prisma, cardId);
  if (!period) throw new DomainError("PERIOD_NOT_FOUND", "Card has no active membership period.");

  return prisma.$transaction(async (tx) => {
    const activeCount = await memberRepo.countActiveMembers(tx, cardId);
    if (!canAddMember(activeCount, period.memberLimit)) {
      throw new DomainError(
        "MEMBER_LIMIT_REACHED",
        `This card already has the maximum of ${period.memberLimit} members.`,
      );
    }

    const member = await memberRepo.createMember(tx, {
      cardId,
      name: input.name,
      age: input.age,
      gender: input.gender,
    });

    await auditRepo.writeAuditEvent(tx, {
      actorId,
      action: "MEMBER_ADDED",
      entityType: "family_member",
      entityId: member.id,
      metadata: { cardId },
    });

    return member;
  }, TX_OPTIONS).then((result) => {
    cache.invalidate(CARDS_CACHE_PREFIX);
    return result;
  });
}

export type UpdateMemberInput = Partial<{
  name: string;
  age: number;
  gender: string;
  status: "ACTIVE" | "INACTIVE";
}>;

export async function updateMember(
  cardId: string,
  memberId: string,
  input: UpdateMemberInput,
  actorId: string,
) {
  const member = await memberRepo.findMemberById(prisma, memberId);
  if (!member || member.cardId !== cardId) {
    throw new DomainError("MEMBER_NOT_FOUND", "Member not found on this card.");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await memberRepo.updateMember(tx, memberId, input);

    await auditRepo.writeAuditEvent(tx, {
      actorId,
      action: "MEMBER_UPDATED",
      entityType: "family_member",
      entityId: memberId,
      metadata: { cardId, changes: input },
    });

    return updated;
  }, TX_OPTIONS).then((result) => {
    cache.invalidate(CARDS_CACHE_PREFIX);
    return result;
  });
}
