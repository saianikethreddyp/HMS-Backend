import type { Prisma, PrismaClient } from "@prisma/client";

type Client = PrismaClient | Prisma.TransactionClient;

export function findActiveOfferById(client: Client, id: string) {
  return client.membershipOffer.findFirst({ where: { id, isActive: true } });
}

export function findDefaultActiveOffer(client: Client) {
  return client.membershipOffer.findFirst({ where: { isActive: true }, orderBy: { createdAt: "asc" } });
}
