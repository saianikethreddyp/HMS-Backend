import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../src/db/prisma.js";
import { addMember } from "../../src/domain/membership/memberService.js";
import { issueCard } from "../../src/domain/membership/cardService.js";
import { createCardWithActivePeriod, createOffer, createStaff, resetDb } from "./helpers.js";

beforeEach(resetDb);
afterAll(async () => {
  await resetDb();
  await prisma.$disconnect();
});

describe("addMember", () => {
  it("enforces the four-member limit from the active period's snapshot", async () => {
    const { staff } = await createStaff({ role: "ADMIN" });
    const { card } = await createCardWithActivePeriod({ issuedById: staff.id, memberLimit: 4 });
    // helper already created one member ("Jane Doe"); add three more to hit the cap.
    for (let i = 0; i < 3; i++) {
      await addMember(card.id, { name: `Member ${i}`, age: 10, gender: "Male" }, staff.id);
    }

    await expect(
      addMember(card.id, { name: "One too many", age: 40, gender: "Male" }, staff.id),
    ).rejects.toMatchObject({ code: "MEMBER_LIMIT_REACHED" });

    const activeCount = await prisma.familyMember.count({ where: { cardId: card.id, status: "ACTIVE" } });
    expect(activeCount).toBe(4);
  });
});

const fourMembers = [
  { name: "A", age: 40, gender: "Male" },
  { name: "B", age: 38, gender: "Female" },
  { name: "C", age: 12, gender: "Male" },
  { name: "D", age: 8, gender: "Female" },
];

describe("issueCard", () => {
  it("auto-generates a unique CARD-XXXXXX card number", async () => {
    const { staff } = await createStaff({ role: "ADMIN" });
    await createOffer();

    const { card } = await issueCard(
      { village: "Rampur", phone: "9876543210", members: fourMembers },
      staff.id,
    );

    expect(card.cardNumber).toMatch(/^CARD-[A-Z0-9]{6}$/);
    expect(card.village).toBe("Rampur");
    expect(card.phone).toBe("9876543210");

    const second = await issueCard(
      { village: "Rampur", phone: "9876543211", members: fourMembers },
      staff.id,
    );
    expect(second.card.cardNumber).not.toBe(card.cardNumber);
  });

  it("rejects issuing a card with more members than the offer allows", async () => {
    const { staff } = await createStaff({ role: "ADMIN" });
    await createOffer({ memberLimit: 2 });

    await expect(
      issueCard(
        { village: "Rampur", phone: "9876543210", members: fourMembers },
        staff.id,
      ),
    ).rejects.toMatchObject({ code: "MEMBER_LIMIT_REACHED" });
  });

  it("rejects issuing a card with fewer members than the offer requires", async () => {
    const { staff } = await createStaff({ role: "ADMIN" });
    await createOffer({ memberLimit: 4 });

    await expect(
      issueCard(
        { village: "Rampur", phone: "9876543210", members: fourMembers.slice(0, 2) },
        staff.id,
      ),
    ).rejects.toMatchObject({ code: "MEMBER_LIMIT_REACHED" });
  });
});
