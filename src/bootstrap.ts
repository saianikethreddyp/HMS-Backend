import type { PrismaClient } from "@prisma/client";
import { env } from "./config/env.js";

const DEFAULT_OFFER = {
  name: "Family Membership",
  pricePaise: 100000,
  validityMonths: 12,
  memberLimit: 4,
  quotaTotal: 20,
  isActive: true,
};

/** Idempotent: creates the default membership offer only if none exists. */
export async function ensureDefaultOffer(client: PrismaClient) {
  const existing = await client.membershipOffer.findFirst({ where: { isActive: true } });
  if (existing) return existing;
  return client.membershipOffer.create({ data: DEFAULT_OFFER });
}

/**
 * Idempotent: creates a default admin account only when the database has no
 * staff at all yet, so login works out of the box on a fresh deploy without
 * requiring a manual seed step. Never touches staff once any exist.
 */
export async function ensureDefaultAdmin(client: PrismaClient) {
  const anyStaff = await client.staffUser.findFirst();
  if (anyStaff) return anyStaff;
  return client.staffUser.create({
    data: { login: env.SEED_ADMIN_LOGIN, name: env.SEED_ADMIN_NAME, role: "ADMIN", isActive: true },
  });
}

export async function ensureBootstrapData(client: PrismaClient) {
  await ensureDefaultOffer(client);
  await ensureDefaultAdmin(client);
}
