import type { Prisma, PrismaClient } from "@prisma/client";

type Client = PrismaClient | Prisma.TransactionClient;

export function createCard(
  client: Client,
  params: { cardNumber: string; village: string; phone: string },
) {
  return client.membershipCard.create({ data: params });
}

export function findCardById(client: Client, id: string) {
  return client.membershipCard.findUnique({ where: { id } });
}

export function findCardByNumber(client: Client, cardNumber: string) {
  return client.membershipCard.findUnique({ where: { cardNumber } });
}

const cardDetailInclude = {
  members: { orderBy: { createdAt: "asc" } },
  periods: {
    orderBy: { startsOn: "desc" },
    include: {
      usages: { orderBy: { occurredAt: "desc" }, include: { member: true } },
    },
  },
} satisfies Prisma.MembershipCardInclude;

export function findCardDetail(client: Client, id: string) {
  return client.membershipCard.findUnique({ where: { id }, include: cardDetailInclude });
}

export function searchCards(client: Client, query: string, limit = 20) {
  return client.membershipCard.findMany({
    where: {
      OR: [
        { cardNumber: { contains: query, mode: "insensitive" } },
        { members: { some: { name: { contains: query, mode: "insensitive" } } } },
        { phone: { contains: query } },
      ],
    },
    include: {
      members: true,
      periods: { where: { status: "ACTIVE" }, take: 1 },
    },
    take: limit,
  });
}

export type ListCardsFilters = {
  from?: Date;
  to?: Date;
  // Omit page/limit to return every matching card unpaginated — the "All
  // Cards" browse view always wants the full matching set, not a page of
  // it; the date filter alone narrows what "all" means.
  page?: number;
  limit?: number;
};

export async function listCards(client: Client, filters: ListCardsFilters) {
  const where: Prisma.MembershipCardWhereInput = {
    createdAt:
      filters.from || filters.to
        ? { gte: filters.from, lte: filters.to }
        : undefined,
  };

  const [cards, total] = await Promise.all([
    client.membershipCard.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: filters.limit ? ((filters.page ?? 1) - 1) * filters.limit : undefined,
      take: filters.limit,
      include: {
        members: true,
        periods: { where: { status: "ACTIVE" }, take: 1 },
      },
    }),
    client.membershipCard.count({ where }),
  ]);

  return { cards, total };
}
