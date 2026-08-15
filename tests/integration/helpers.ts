import { prisma } from "../../src/db/prisma.js";
import { computePeriodEnd, toDateOnly } from "../../src/domain/membership/rules.js";

export async function resetDb() {
  await prisma.$transaction([
    prisma.auditEvent.deleteMany(),
    prisma.serviceUsage.deleteMany(),
    prisma.familyMember.deleteMany(),
    prisma.membershipPeriod.deleteMany(),
    prisma.membershipCard.deleteMany(),
    prisma.membershipOffer.deleteMany(),
    prisma.session.deleteMany(),
    prisma.staffUser.deleteMany(),
  ]);
}

export async function createStaff(opts?: { role?: "ADMIN" | "STAFF"; login?: string }) {
  const login = opts?.login ?? `staff-${Math.random().toString(36).slice(2, 8)}`;
  const staff = await prisma.staffUser.create({
    data: { login, name: "Test Staff", role: opts?.role ?? "STAFF", isActive: true },
  });
  return { staff, login };
}

export async function createOffer(overrides?: Partial<{ quotaTotal: number; memberLimit: number; validityMonths: number }>) {
  return prisma.membershipOffer.create({
    data: {
      name: "Family Membership",
      pricePaise: 100000,
      validityMonths: overrides?.validityMonths ?? 12,
      memberLimit: overrides?.memberLimit ?? 4,
      quotaTotal: overrides?.quotaTotal ?? 20,
      isActive: true,
    },
  });
}

export async function createCardWithActivePeriod(opts: {
  issuedById: string;
  quotaUsed?: number;
  quotaTotal?: number;
  memberLimit?: number;
  startsOn?: Date;
  endsOn?: Date;
}) {
  const offer = await createOffer({ quotaTotal: opts.quotaTotal, memberLimit: opts.memberLimit });
  const card = await prisma.membershipCard.create({
    data: {
      cardNumber: `CARD-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      village: "Test Village",
      phone: "9000000000",
    },
  });
  const startsOn = opts.startsOn ? toDateOnly(opts.startsOn) : toDateOnly(new Date());
  const endsOn = opts.endsOn ?? computePeriodEnd(startsOn, offer.validityMonths);
  const period = await prisma.membershipPeriod.create({
    data: {
      cardId: card.id,
      offerId: offer.id,
      pricePaise: offer.pricePaise,
      memberLimit: offer.memberLimit,
      quotaTotal: offer.quotaTotal,
      quotaUsed: opts.quotaUsed ?? 0,
      startsOn,
      endsOn,
      issuedById: opts.issuedById,
    },
  });
  const member = await prisma.familyMember.create({
    data: { cardId: card.id, name: "Jane Doe", age: 34, gender: "Female", status: "ACTIVE" },
  });
  return { offer, card, period, member };
}
