import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../src/db/prisma.js";
import { ensureDefaultAdmin, ensureDefaultOffer } from "../../src/bootstrap.js";
import { createOffer, createStaff, resetDb } from "./helpers.js";

beforeEach(resetDb);
afterAll(async () => {
  await resetDb();
  await prisma.$disconnect();
});

describe("ensureDefaultAdmin", () => {
  it("creates a default admin when the database has no staff at all", async () => {
    const admin = await ensureDefaultAdmin(prisma);
    expect(admin.role).toBe("ADMIN");
    expect(admin.login).toBe("admin");

    const count = await prisma.staffUser.count();
    expect(count).toBe(1);
  });

  it("does nothing when any staff already exists", async () => {
    const { staff } = await createStaff({ role: "STAFF", login: "existing-staff" });

    const result = await ensureDefaultAdmin(prisma);
    expect(result.id).toBe(staff.id);

    const count = await prisma.staffUser.count();
    expect(count).toBe(1);
  });
});

describe("ensureDefaultOffer", () => {
  it("creates the default offer when none exists", async () => {
    const offer = await ensureDefaultOffer(prisma);
    expect(offer.quotaTotal).toBe(20);
    expect(offer.memberLimit).toBe(4);

    const count = await prisma.membershipOffer.count();
    expect(count).toBe(1);
  });

  it("does nothing when an active offer already exists", async () => {
    const existing = await createOffer({ quotaTotal: 30 });

    const result = await ensureDefaultOffer(prisma);
    expect(result.id).toBe(existing.id);

    const count = await prisma.membershipOffer.count();
    expect(count).toBe(1);
  });
});
