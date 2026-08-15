import { Router } from "express";
import { z } from "zod";
import * as cardService from "../domain/membership/cardService.js";
import * as memberService from "../domain/membership/memberService.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { requireCsrf } from "../middleware/csrf.js";
import { mutationRateLimiter } from "../middleware/rateLimit.js";

export const cardsRouter = Router();

cardsRouter.use(requireAuth);

const memberInputSchema = z.object({
  name: z.string().min(1),
  age: z.number().int().min(0).max(120),
  gender: z.string().min(1),
});

const issueCardSchema = z.object({
  village: z.string().min(1),
  phone: z.string().min(1),
  offerId: z.string().uuid().optional(),
  startsOn: z.coerce.date().optional(),
  // Hardcoded to 4: the single confirmed offer always requires exactly 4
  // members at registration. Revisit if a second offer with a different
  // member limit is ever introduced.
  members: z.array(memberInputSchema).length(4),
});

cardsRouter.post("/", requireRole("ADMIN"), requireCsrf, mutationRateLimiter, async (req, res, next) => {
  try {
    const body = issueCardSchema.parse(req.body);
    const result = await cardService.issueCard(body, req.session!.staffUserId);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

const searchQuerySchema = z.object({ query: z.string().min(1) });

cardsRouter.get("/", async (req, res, next) => {
  try {
    const { query } = searchQuerySchema.parse(req.query);
    const cards = await cardService.searchCards(query);
    res.json({ cards });
  } catch (err) {
    next(err);
  }
});

const listQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  // No default: omitting page/limit returns every matching card so staff can
  // see the true total, not just one page of it.
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(5000).optional(),
});

cardsRouter.get("/all", async (req, res, next) => {
  try {
    const query = listQuerySchema.parse(req.query);
    const result = await cardService.listCards(query);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

const idParamSchema = z.object({ id: z.string().uuid() });

cardsRouter.get("/:id", async (req, res, next) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const card = await cardService.getCardDetail(id);
    res.json({ card });
  } catch (err) {
    next(err);
  }
});

cardsRouter.post(
  "/:id/members",
  requireRole("ADMIN"),
  requireCsrf,
  mutationRateLimiter,
  async (req, res, next) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const body = memberInputSchema.parse(req.body);
      const member = await memberService.addMember(id, body, req.session!.staffUserId);
      res.status(201).json({ member });
    } catch (err) {
      next(err);
    }
  },
);

const updateMemberSchema = z.object({
  name: z.string().min(1).optional(),
  age: z.number().int().min(0).max(120).optional(),
  gender: z.string().min(1).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

const memberParamsSchema = z.object({ id: z.string().uuid(), memberId: z.string().uuid() });

cardsRouter.patch(
  "/:id/members/:memberId",
  requireRole("ADMIN"),
  requireCsrf,
  mutationRateLimiter,
  async (req, res, next) => {
    try {
      const { id, memberId } = memberParamsSchema.parse(req.params);
      const body = updateMemberSchema.parse(req.body);
      const member = await memberService.updateMember(id, memberId, body, req.session!.staffUserId);
      res.json({ member });
    } catch (err) {
      next(err);
    }
  },
);

const renewSchema = z.object({ offerId: z.string().uuid().optional() });

cardsRouter.post(
  "/:id/renew",
  requireRole("ADMIN"),
  requireCsrf,
  mutationRateLimiter,
  async (req, res, next) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const body = renewSchema.parse(req.body ?? {});
      const period = await cardService.renewCard(id, req.session!.staffUserId, body);
      res.status(201).json({ period });
    } catch (err) {
      next(err);
    }
  },
);
