import type { Prisma, PrismaClient } from "@prisma/client";

type Client = PrismaClient | Prisma.TransactionClient;

export function writeAuditEvent(
  client: Client,
  params: {
    actorId: string | null;
    action: string;
    entityType: string;
    entityId: string;
    metadata?: Prisma.InputJsonValue;
    correlationId?: string;
  },
) {
  return client.auditEvent.create({ data: params });
}
