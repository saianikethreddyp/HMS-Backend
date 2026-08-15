import crypto from "node:crypto";
import { prisma } from "../../db/prisma.js";
import { env } from "../../config/env.js";
import { DomainError } from "../../lib/errors.js";
import * as staffRepo from "../../repositories/staffRepo.js";

export type SessionContext = {
  sessionId: string;
  staffUserId: string;
  role: "ADMIN" | "STAFF";
  name: string;
  login: string;
};

function sessionExpiry(): Date {
  return new Date(Date.now() + env.SESSION_TTL_HOURS * 60 * 60 * 1000);
}

export async function login(login: string): Promise<{ session: SessionContext; expiresAt: Date }> {
  const staff = await staffRepo.findStaffByLogin(prisma, login);
  if (!staff || !staff.isActive) {
    throw new DomainError("INVALID_CREDENTIALS", "Invalid login.");
  }

  const expiresAt = sessionExpiry();
  const session = await staffRepo.createSession(prisma, { staffUserId: staff.id, expiresAt });

  return {
    session: {
      sessionId: session.id,
      staffUserId: staff.id,
      role: staff.role,
      name: staff.name,
      login: staff.login,
    },
    expiresAt,
  };
}

export async function logout(sessionId: string): Promise<void> {
  await staffRepo.deleteSession(prisma, sessionId);
}

export async function resolveSession(sessionId: string): Promise<SessionContext | null> {
  const record = await staffRepo.findSessionWithStaff(prisma, sessionId);
  if (!record) return null;
  if (record.expiresAt.getTime() <= Date.now()) {
    await staffRepo.deleteSession(prisma, sessionId);
    return null;
  }
  if (!record.staffUser.isActive) return null;

  return {
    sessionId: record.id,
    staffUserId: record.staffUser.id,
    role: record.staffUser.role,
    name: record.staffUser.name,
    login: record.staffUser.login,
  };
}

export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString("hex");
}
