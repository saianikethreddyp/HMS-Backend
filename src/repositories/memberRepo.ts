import type { Prisma, PrismaClient } from "@prisma/client";

type Client = PrismaClient | Prisma.TransactionClient;

export function countActiveMembers(client: Client, cardId: string) {
  return client.familyMember.count({ where: { cardId, status: "ACTIVE" } });
}

export function findMemberById(client: Client, id: string) {
  return client.familyMember.findUnique({ where: { id } });
}

export function createMember(
  client: Client,
  params: {
    cardId: string;
    name: string;
    age: number;
    gender: string;
  },
) {
  return client.familyMember.create({ data: params });
}

export function updateMember(
  client: Client,
  id: string,
  params: Partial<{
    name: string;
    age: number;
    gender: string;
    status: "ACTIVE" | "INACTIVE";
  }>,
) {
  return client.familyMember.update({ where: { id }, data: params });
}
