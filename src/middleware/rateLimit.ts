import rateLimit from "express-rate-limit";
import { DomainError } from "../lib/errors.js";

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(new DomainError("RATE_LIMITED", "Too many login attempts. Try again later."));
  },
});

export const mutationRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(new DomainError("RATE_LIMITED", "Too many requests. Slow down and try again."));
  },
});
