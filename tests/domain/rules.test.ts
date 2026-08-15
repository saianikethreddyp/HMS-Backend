import { describe, expect, it } from "vitest";
import {
  canAddMember,
  computePeriodEnd,
  isPeriodExpired,
  remainingQuota,
  toDateOnly,
} from "../../src/domain/membership/rules.js";
import { isSupportedServiceType } from "../../src/domain/usage/rules.js";

describe("computePeriodEnd", () => {
  it("returns the day before the same date N months later", () => {
    const start = new Date(Date.UTC(2026, 0, 1)); // 2026-01-01
    const end = computePeriodEnd(start, 12);
    expect(end.toISOString().slice(0, 10)).toBe("2026-12-31");
  });

  it("handles month-length edge cases", () => {
    const start = new Date(Date.UTC(2026, 0, 31)); // 2026-01-31
    const end = computePeriodEnd(start, 1);
    // JS Date rolls Feb 31 -> Mar 3 (2026 is not a leap year), then -1 day = Mar 2.
    expect(end.getUTCMonth()).toBe(2);
  });
});

describe("isPeriodExpired", () => {
  it("is not expired on the end date itself (inclusive boundary)", () => {
    const endsOn = new Date(Date.UTC(2026, 7, 14));
    expect(isPeriodExpired(endsOn, endsOn)).toBe(false);
  });

  it("is expired the day after the end date", () => {
    const endsOn = new Date(Date.UTC(2026, 7, 14));
    const dayAfter = new Date(Date.UTC(2026, 7, 15));
    expect(isPeriodExpired(endsOn, dayAfter)).toBe(true);
  });
});

describe("toDateOnly", () => {
  it("strips time-of-day", () => {
    const withTime = new Date(Date.UTC(2026, 7, 14, 23, 59, 59));
    expect(toDateOnly(withTime).toISOString()).toBe("2026-08-14T00:00:00.000Z");
  });
});

describe("canAddMember", () => {
  it("allows up to the member limit", () => {
    expect(canAddMember(3, 4)).toBe(true);
    expect(canAddMember(4, 4)).toBe(false);
    expect(canAddMember(0, 4)).toBe(true);
  });
});

describe("remainingQuota", () => {
  it("starts at quota_total when nothing is used", () => {
    expect(remainingQuota(20, 0)).toBe(20);
  });

  it("decreases as uses accumulate: 19th use leaves one, 20th leaves zero", () => {
    expect(remainingQuota(20, 19)).toBe(1);
    expect(remainingQuota(20, 20)).toBe(0);
  });

  it("never goes negative even if used somehow exceeds total", () => {
    expect(remainingQuota(20, 21)).toBe(0);
  });
});

describe("isSupportedServiceType", () => {
  it("accepts OP, PHARMACY, DIAGNOSTIC", () => {
    expect(isSupportedServiceType("OP")).toBe(true);
    expect(isSupportedServiceType("PHARMACY")).toBe(true);
    expect(isSupportedServiceType("DIAGNOSTIC")).toBe(true);
  });

  it("rejects unsupported or legacy service types like LAB or IP", () => {
    expect(isSupportedServiceType("LAB")).toBe(false);
    expect(isSupportedServiceType("IP")).toBe(false);
    expect(isSupportedServiceType("")).toBe(false);
  });
});
