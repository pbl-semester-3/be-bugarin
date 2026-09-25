import type { Request, Response, NextFunction } from "express";
import { ptService } from "./pt.service";
import { respondPairingRequestSchema } from "./pt.schema";

export const ptController = {
  async getPtRecommendations(req: Request, res: Response, next: NextFunction) {
    try {
      // @ts-expect-error req.user is injected by authGuard
      const userId = req.user.id;
      const data = await ptService.getPtRecommendations(userId);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  },

  async getPairingRequests(req: Request, res: Response, next: NextFunction) {
    try {
      // @ts-expect-error req.user is injected by authGuard
      const userId = req.user.id;
      const data = await ptService.getPairingRequests(userId);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  },

  async respondPairingRequest(req: Request, res: Response, next: NextFunction) {
    try {
      // @ts-expect-error req.user is injected by authGuard
      const userId = req.user.id;
      const requestId = parseInt(req.params.id, 10);
      
      const parsedData = respondPairingRequestSchema.parse(req.body);
      const data = await ptService.respondPairingRequest(userId, requestId, parsedData.alasanPenolakan);
      
      res.json({ data });
    } catch (error) {
      next(error);
    }
  }
};
