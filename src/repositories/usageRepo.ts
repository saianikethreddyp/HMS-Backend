import type { Prisma, PrismaClient } from "@prisma/client";

type Client = PrismaClient | Prisma.TransactionClient;

export function findUsageByIdempotencyKey(client: Client, key: string) {
  return client.serviceUsage.findUnique({ where: { idempotencyKey: key } });
}

export function findUsageById(client: Client, id: string) {
  return client.serviceUsage.findUnique({ where: { id } });
}

export function createUsage(
  client: Client,
  params: {
    periodId: string;
    cardId: string;
    memberId: string;
    serviceType: "OP" | "PHARMACY" | "DIAGNOSTIC";
    recordedById: string;
    idempotencyKey: string;
  },
) {
  return client.serviceUsage.create({ data: params });
}

export function voidUsage(
  client: Client,
  id: string,
  params: { voidedById: string; voidReason: string },
) {
  return client.serviceUsage.update({
    where: { id },
    data: {
      voidedAt: new Date(),
      voidedById: params.voidedById,
      voidReason: params.voidReason,
    },
  });
}

export type ListUsagesFilters = {
  cardNumber?: string;
  serviceType?: "OP" | "PHARMACY" | "DIAGNOSTIC";
  from?: Date;
  to?: Date;
  includeVoided?: boolean;
  page: number;
  limit: number;
};

export async function listUsages(client: Client, filters: ListUsagesFilters) {
  const where: Prisma.ServiceUsageWhereInput = {
    serviceType: filters.serviceType,
    voidedAt: filters.includeVoided === false ? null : undefined,
    occurredAt:
      filters.from || filters.to
        ? { gte: filters.from, lte: filters.to }
        : undefined,
    card: filters.cardNumber
      ? { cardNumber: { contains: filters.cardNumber, mode: "insensitive" } }
      : undefined,
  };

  const [usages, total] = await Promise.all([
    client.serviceUsage.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
      include: { card: true, member: true, recordedBy: true },
    }),
    client.serviceUsage.count({ where }),
  ]);

  return { usages, total };
}
