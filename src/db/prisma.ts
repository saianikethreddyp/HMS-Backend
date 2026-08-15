import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

/**
 * Multi-step domain transactions do several sequential round trips over a
 * remote pooled connection; under concurrent contention on the same row
 * (e.g. two staff recording the last use at once), Prisma's 5s default
 * interactive-transaction timeout can trip before a waiting transaction gets
 * its turn, surfacing as a raw P2028 instead of a clean domain error.
 */
export const TX_OPTIONS = { timeout: 15000, maxWait: 15000 };
