import type { Prisma, PrismaClient, StaffUser } from "@prisma/client";

type Client = PrismaClient | Prisma.TransactionClient;

export function findStaffByLogin(client: Client, login: string): Promise<StaffUser | null> {
  return client.staffUser.findUnique({ where: { login } });
}

export function findStaffById(client: Client, id: string): Promise<StaffUser | null> {
  return client.staffUser.findUnique({ where: { id } });
}

export function createSession(
  client: Client,
  params: { staffUserId: string; expiresAt: Date },
) {
  return client.session.create({ data: params });
}

export function findSessionWithStaff(client: Client, id: string) {
  return client.session.findUnique({ where: { id }, include: { staffUser: true } });
}

export function deleteSession(client: Client, id: string) {
  return client.session.deleteMany({ where: { id } });
}
