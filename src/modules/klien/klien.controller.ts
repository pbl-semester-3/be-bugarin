import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { klienService } from "./klien.service";
import { 
  updateProfileSchema, 
  changePasswordSchema, 
  changeThemeSchema, 
  weightLogSchema, 
  newCycleSchema,
  createActivityLogSchema,
  createMealLogSchema,
  sendPairingRequestSchema
} from "./klien.schema";

export const klienController = {
  async getProfile(req: Request, res: Response, next: NextFunction) {
    try {
      // @ts-expect-error req.user is injected by authGuard
      const userId = req.user.id;
      const data = await klienService.getProfile(userId);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  },

  async updateProfile(req: Request, res: Response, next: NextFunction) {
    try {
      // @ts-expect-error req.user is injected by authGuard
      const userId = req.user.id;
      const parsedData = updateProfileSchema.parse(req.body);
      const data = await klienService.updateProfile(userId, parsedData);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  },

  async changePassword(req: Request, res: Response, next: NextFunction) {
    try {
      // @ts-expect-error req.user is injected by authGuard
      const userId = req.user.id;
      const parsedData = changePasswordSchema.parse(req.body);
      const data = await klienService.changePassword(userId, parsedData);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  },

  async changeTheme(req: Request, res: Response, next: NextFunction) {
    try {
      // @ts-expect-error req.user is injected by authGuard
      const userId = req.user.id;
      const parsedData = changeThemeSchema.parse(req.body);
      const data = await klienService.changeTheme(userId, parsedData);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  },

  async addWeightLog(req: Request, res: Response, next: NextFunction) {
    try {
      // @ts-expect-error req.user is injected by authGuard
      const userId = req.user.id;
      const parsedData = weightLogSchema.parse(req.body);
      const data = await klienService.addWeightLog(userId, parsedData);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  },

  async getProgressCycles(req: Request, res: Response, next: NextFunction) {
    try {
      // @ts-expect-error req.user is injected by authGuard
      const userId = req.user.id;
      const data = await klienService.getProgressCycles(userId);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  },

  async startNewProgressCycle(req: Request, res: Response, next: NextFunction) {
    try {
      // @ts-expect-error req.user is injected by authGuard
      const userId = req.user.id;
      const parsedData = newCycleSchema.parse(req.body);
      const data = await klienService.startNewProgressCycle(userId, parsedData);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  },

  async createActivityLog(req: Request, res: Response, next: NextFunction) {
    try {
      // @ts-expect-error req.user is injected by authGuard
      const userId = req.user.id;
      const parsedData = createActivityLogSchema.parse(req.body);
      const data = await klienService.createActivityLog(userId, parsedData);
      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  },

  async createMealLog(req: Request, res: Response, next: NextFunction) {
    try {
      // @ts-expect-error req.user is injected by authGuard
      const userId = req.user.id;
      const parsedData = createMealLogSchema.parse(req.body);
      const data = await klienService.createMealLog(userId, parsedData);
      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  },

  async getCurrentWeeklyPlan(req: Request, res: Response, next: NextFunction) {
    try {
      // @ts-expect-error req.user is injected by authGuard
      const userId = req.user.id;
      const data = await klienService.getCurrentWeeklyPlan(userId);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  },

  async sendPairingRequest(req: Request, res: Response, next: NextFunction) {
    try {
      // @ts-expect-error req.user is injected by authGuard
      const userId = req.user.id;
      const parsedData = sendPairingRequestSchema.parse(req.body);
      const data = await klienService.sendPairingRequest(userId, parsedData);
      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  },

  async getCurrentPairingRequest(req: Request, res: Response, next: NextFunction) {
    try {
      // @ts-expect-error req.user is injected by authGuard
      const userId = req.user.id;
      const data = await klienService.getCurrentPairingRequest(userId);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  },

  async getCycleLogs(req: Request, res: Response, next: NextFunction) {
    try {
      // @ts-expect-error req.user is injected by authGuard
      const userId = req.user.id;
      
      const paramResult = z.coerce.number().int().positive().safeParse(req.params.id);
      if (!paramResult.success) {
        return res.status(400).json({ error: "ID siklus tidak valid" });
      }
      
      const cycleId = paramResult.data;
      const data = await klienService.getCycleLogs(userId, cycleId);
      
      res.json({ data, meta: { total: data.length } });
    } catch (error) {
      next(error);
    }
  }
};
