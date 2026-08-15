/**
 * Pure domain rules for membership periods and members. Kept dependency-free
 * so they can be unit tested without a database.
 */

/** Inclusive date-only period boundary: starts today, ends the day before the
 * same date N months later (e.g. 2026-01-01 + 12 months -> 2026-12-31). */
export function computePeriodEnd(startsOn: Date, validityMonths: number): Date {
  const end = new Date(Date.UTC(startsOn.getUTCFullYear(), startsOn.getUTCMonth(), startsOn.getUTCDate()));
  end.setUTCMonth(end.getUTCMonth() + validityMonths);
  end.setUTCDate(end.getUTCDate() - 1);
  return end;
}

/** Truncates a Date to a UTC date-only value (midnight), used for date-only
 * membership boundaries regardless of the wall-clock time supplied. */
export function toDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function isPeriodExpired(endsOn: Date, asOf: Date): boolean {
  return toDateOnly(asOf).getTime() > toDateOnly(endsOn).getTime();
}

export function canAddMember(activeMemberCount: number, memberLimit: number): boolean {
  return activeMemberCount < memberLimit;
}

export function remainingQuota(quotaTotal: number, quotaUsed: number): number {
  return Math.max(0, quotaTotal - quotaUsed);
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** UTC instant bounds [start, end) of "today" in the confirmed operating
 * timezone (Asia/Kolkata, UTC+5:30, no DST) for a given instant. */
export function istDayBounds(now: Date): { start: Date; end: Date } {
  const shifted = new Date(now.getTime() + IST_OFFSET_MS);
  const istMidnightUtc = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  const start = new Date(istMidnightUtc - IST_OFFSET_MS);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}
