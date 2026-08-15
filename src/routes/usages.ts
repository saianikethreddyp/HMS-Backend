import { Router } from "express";
import { z } from "zod";
import * as usageService from "../domain/usage/usageService.js";
import * as voidService from "../domain/usage/voidService.js";
import { isSupportedServiceType } from "../domain/usage/rules.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { requireCsrf } from "../middleware/csrf.js";
import { mutationRateLimiter } from "../middleware/rateLimit.js";

export const usagesRouter = Router();

usagesRouter.use(requireAuth);

const recordUsageSchema = z.object({
  cardId: z.string().uuid(),
  memberId: z.string().uuid(),
  serviceType: z.string().refine(isSupportedServiceType, { message: "Unsupported service type." }),
  idempotencyKey: z.string().min(1),
});

const listUsagesQuerySchema = z.object({
  cardNumber: z.string().min(1).optional(),
  serviceType: z
    .string()
    .refine(isSupportedServiceType, { message: "Unsupported service type." })
    .optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  includeVoided: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

usagesRouter.get("/", requireRole("ADMIN"), async (req, res, next) => {
  try {
    const query = listUsagesQuerySchema.parse(req.query);
    const result = await usageService.listUsages({
      ...query,
      serviceType: query.serviceType as "OP" | "PHARMACY" | "DIAGNOSTIC" | undefined,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

usagesRouter.post("/", requireCsrf, mutationRateLimiter, async (req, res, next) => {
  try {
    const body = recordUsageSchema.parse(req.body);
    const result = await usageService.recordUsage(
      { ...body, serviceType: body.serviceType as "OP" | "PHARMACY" | "DIAGNOSTIC" },
      req.session!.staffUserId,
    );
    res.status(result.replayed ? 200 : 201).json(result);
  } catch (err) {
    next(err);
  }
});

const voidParamsSchema = z.object({ id: z.string().uuid() });
const voidBodySchema = z.object({ reason: z.string().min(1) });

usagesRouter.post(
  "/:id/void",
  requireRole("ADMIN"),
  requireCsrf,
  mutationRateLimiter,
  async (req, res, next) => {
    try {
      const { id } = voidParamsSchema.parse(req.params);
      const { reason } = voidBodySchema.parse(req.body);
      const usage = await voidService.voidUsage(id, reason, req.session!.staffUserId);
      res.json({ usage });
    } catch (err) {
      next(err);
    }
  },
);
