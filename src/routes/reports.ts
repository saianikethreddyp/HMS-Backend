import { Router } from "express";
import * as reportingService from "../domain/reporting/reportingService.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const reportsRouter = Router();

reportsRouter.use(requireAuth);

reportsRouter.get("/summary", requireRole("ADMIN"), async (_req, res, next) => {
  try {
    const summary = await reportingService.getSummary();
    res.json({ summary });
  } catch (err) {
    next(err);
  }
});
