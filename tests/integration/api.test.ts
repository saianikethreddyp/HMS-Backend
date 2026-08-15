import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/db/prisma.js";
import { createCardWithActivePeriod, createOffer, createStaff, resetDb } from "./helpers.js";

const app = createApp();

beforeEach(resetDb);
afterAll(async () => {
  await resetDb();
  await prisma.$disconnect();
});

function extractCookie(res: request.Response, name: string): string {
  const raw = res.headers["set-cookie"] as unknown as string[] | undefined;
  const line = raw?.find((c) => c.startsWith(`${name}=`));
  if (!line) throw new Error(`cookie ${name} not set`);
  return line.split(";")[0]!;
}

async function loginAs(login: string) {
  const res = await request(app).post("/auth/login").send({ login });
  expect(res.status).toBe(200);
  const sessionCookie = extractCookie(res, "hms_sid");
  const csrfCookie = extractCookie(res, "hms_csrf");
  const csrfToken = csrfCookie.split("=")[1]!;
  return { cookies: [sessionCookie, csrfCookie], csrfToken };
}

describe("auth", () => {
  it("rejects an unknown login and allows a known, active one", async () => {
    const bad = await request(app).post("/auth/login").send({ login: "no-such-user" });
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe("INVALID_CREDENTIALS");

    const { login } = await createStaff();
    const good = await request(app).post("/auth/login").send({ login });
    expect(good.status).toBe(200);
  });
});

describe("staff usage flow end-to-end", () => {
  it(
    "logs in, finds an active card, records OP, and sees one fewer use",
    async () => {
      const { staff, login } = await createStaff({ role: "STAFF" });
      const { card, member } = await createCardWithActivePeriod({ issuedById: staff.id });

      const { cookies, csrfToken } = await loginAs(login);

      const record = await request(app)
        .post("/usages")
        .set("Cookie", cookies)
        .set("x-csrf-token", csrfToken)
        .send({ cardId: card.id, memberId: member.id, serviceType: "OP", idempotencyKey: "flow-1" });
      expect(record.status).toBe(201);
      expect(record.body.after).toBe(19);

      const detail = await request(app).get(`/cards/${card.id}`).set("Cookie", cookies);
      expect(detail.status).toBe(200);
      const activePeriod = detail.body.card.periods.find((p: { status: string }) => p.status === "ACTIVE");
      expect(activePeriod.quotaUsed).toBe(1);
    },
    // This test chains ~8 sequential round trips (staff/card/period/member
    // inserts, login, a transactional usage record, and a detail fetch)
    // over the pooled Neon connection used in this environment; the default
    // 20s per-test timeout is too tight for that -- see the same note on
    // seedLedger in reporting.test.ts.
    60000,
  );

  it("blocks recording usage without authentication", async () => {
    const { staff } = await createStaff();
    const { card, member } = await createCardWithActivePeriod({ issuedById: staff.id });

    const res = await request(app)
      .post("/usages")
      .send({ cardId: card.id, memberId: member.id, serviceType: "OP", idempotencyKey: "no-auth" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("blocks a STAFF user from voiding a usage (admin-only)", async () => {
    const { staff, login } = await createStaff({ role: "STAFF" });
    const { card, member } = await createCardWithActivePeriod({ issuedById: staff.id });
    const { cookies, csrfToken } = await loginAs(login);

    const record = await request(app)
      .post("/usages")
      .set("Cookie", cookies)
      .set("x-csrf-token", csrfToken)
      .send({ cardId: card.id, memberId: member.id, serviceType: "OP", idempotencyKey: "void-block" });

    const voidAttempt = await request(app)
      .post(`/usages/${record.body.usageId}/void`)
      .set("Cookie", cookies)
      .set("x-csrf-token", csrfToken)
      .send({ reason: "test" });
    expect(voidAttempt.status).toBe(403);
    expect(voidAttempt.body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects a mutation missing the CSRF header even with a valid session", async () => {
    const { login } = await createStaff({ role: "ADMIN" });
    await createOffer();
    const { cookies } = await loginAs(login);

    const res = await request(app)
      .post("/cards")
      .set("Cookie", cookies)
      .send({ village: "X", phone: "1", members: [] });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("CSRF_FAILED");
  });
});
