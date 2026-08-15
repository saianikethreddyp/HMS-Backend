import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { DomainError } from "../lib/errors.js";
import { resolveSession, type SessionContext } from "../domain/auth/authService.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      session?: SessionContext;
    }
  }
}

export async function attachSession(req: Request, _res: Response, next: NextFunction) {
  const sessionId = req.cookies?.[env.SESSION_COOKIE_NAME] as string | undefined;
  if (sessionId) {
    req.session = (await resolveSession(sessionId)) ?? undefined;
  }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.session) {
    return next(new DomainError("UNAUTHENTICATED", "Sign in required."));
  }
  next();
}

export function requireRole(...roles: Array<"ADMIN" | "STAFF">) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.session) {
      return next(new DomainError("UNAUTHENTICATED", "Sign in required."));
    }
    if (!roles.includes(req.session.role)) {
      return next(new DomainError("UNAUTHORIZED", "You do not have permission to perform this action."));
    }
    next();
  };
}
