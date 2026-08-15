import { Router } from "express";
import { prisma } from "../db/prisma.js";

export const healthRouter = Router();

// process.uptime() resets to 0 whenever the process restarts (crash, deploy,
// Render's free-tier spin-down/spin-up), so a low value here is itself a
// downtime signal even when the current response is "ok".
const startedAt = new Date();

healthRouter.get("/healthz", async (_req, res) => {
  const dbStart = performance.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const dbLatencyMs = Math.round(performance.now() - dbStart);
    res.json({
      status: "ok",
      database: { status: "ok", latencyMs: dbLatencyMs },
      uptimeSeconds: Math.round(process.uptime()),
      startedAt: startedAt.toISOString(),
      checkedAt: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({
      status: "degraded",
      database: { status: "unreachable" },
      uptimeSeconds: Math.round(process.uptime()),
      startedAt: startedAt.toISOString(),
      checkedAt: new Date().toISOString(),
    });
  }
});
