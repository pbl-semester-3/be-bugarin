import type { Request, Response, NextFunction } from "express";
import { klienService } from "./klien.service";
import { 
  updateProfileSchema, 
  changePasswordSchema, 
  changeThemeSchema, 
  weightLogSchema, 
  newCycleSchema 
} from "./klien.schema";

export const klienController = {
  async getProfile(req: Request, res: Response, next: NextFunction) {
    try {
      // @ts-ignore
      const userId = req.user.id;
      const data = await klienService.getProfile(userId);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  },

  async updateProfile(req: Request, res: Response, next: NextFunction) {
    try {
      // @ts-ignore
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
      // @ts-ignore
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
      // @ts-ignore
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
      // @ts-ignore
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
      // @ts-ignore
      const userId = req.user.id;
      const data = await klienService.getProgressCycles(userId);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  },

  async startNewProgressCycle(req: Request, res: Response, next: NextFunction) {
    try {
      // @ts-ignore
      const userId = req.user.id;
      const parsedData = newCycleSchema.parse(req.body);
      const data = await klienService.startNewProgressCycle(userId, parsedData);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  },
};
