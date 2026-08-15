import { Router } from "express";
import { z } from "zod";
import { env, isProduction } from "../config/env.js";
import * as authService from "../domain/auth/authService.js";
import { loginRateLimiter } from "../middleware/rateLimit.js";
import { requireAuth } from "../middleware/auth.js";
import { requireCsrf } from "../middleware/csrf.js";

export const authRouter = Router();

const loginSchema = z.object({
  login: z.string().min(1),
});

function setAuthCookies(res: import("express").Response, sessionId: string, expiresAt: Date) {
  res.cookie(env.SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    expires: expiresAt,
    path: "/",
  });
  const csrfToken = authService.generateCsrfToken();
  res.cookie(env.CSRF_COOKIE_NAME, csrfToken, {
    httpOnly: false,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    expires: expiresAt,
    path: "/",
  });
}

authRouter.post("/login", loginRateLimiter, async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const { session, expiresAt } = await authService.login(body.login);
    setAuthCookies(res, session.sessionId, expiresAt);
    res.json({ user: { name: session.name, login: session.login, role: session.role } });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/logout", requireCsrf, async (req, res, next) => {
  try {
    const sessionId = req.cookies?.[env.SESSION_COOKIE_NAME] as string | undefined;
    if (sessionId) await authService.logout(sessionId);
    res.clearCookie(env.SESSION_COOKIE_NAME, { path: "/" });
    res.clearCookie(env.CSRF_COOKIE_NAME, { path: "/" });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: { name: req.session!.name, login: req.session!.login, role: req.session!.role } });
});
