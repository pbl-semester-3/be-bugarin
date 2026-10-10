import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { adminService } from "./admin.service";
import {
  updateAdminProfileSchema,
  changeAdminPasswordSchema,
  changeAdminThemeSchema,
  getUsersQuerySchema,
  createPtSchema,
  updateUserSchema,
} from "./admin.schema";

export const adminController = {
  async getProfile(req: Request, res: Response, next: NextFunction) {
    try {
      // @ts-expect-error req.user is injected by authGuard
      const userId = req.user.id;
      const data = await adminService.getProfile(userId);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  },

  async updateProfile(req: Request, res: Response, next: NextFunction) {
    try {
      // @ts-expect-error req.user is injected by authGuard
      const userId = req.user.id;
      const parsedData = updateAdminProfileSchema.parse(req.body);
      const data = await adminService.updateProfile(userId, parsedData);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  },

  async changePassword(req: Request, res: Response, next: NextFunction) {
    try {
      // @ts-expect-error req.user is injected by authGuard
      const userId = req.user.id;
      const parsedData = changeAdminPasswordSchema.parse(req.body);
      const data = await adminService.changePassword(userId, parsedData);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  },

  async changeTheme(req: Request, res: Response, next: NextFunction) {
    try {
      // @ts-expect-error req.user is injected by authGuard
      const userId = req.user.id;
      const parsedData = changeAdminThemeSchema.parse(req.body);
      const data = await adminService.changeTheme(userId, parsedData);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  },

  async getDashboardSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await adminService.getDashboardSummary();
      res.json({ data });
    } catch (error) {
      next(error);
    }
  },

  async listUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = getUsersQuerySchema.parse(req.query);
      const response = await adminService.listUsers(parsed.role);
      res.json(response);
    } catch (error) {
      next(error);
    }
  },

  async createPt(req: Request, res: Response, next: NextFunction) {
    try {
      // @ts-expect-error req.user is injected by authGuard
      const adminId = req.user.id;
      const parsedData = createPtSchema.parse(req.body);
      const data = await adminService.createPt(adminId, parsedData);
      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  },

  async updateUser(req: Request, res: Response, next: NextFunction) {
    try {
      // @ts-expect-error req.user is injected by authGuard
      const adminId = req.user.id;

      const paramResult = z.coerce.number().int().positive().safeParse(req.params.id);
      if (!paramResult.success) {
        return res.status(400).json({ error: "ID user tidak valid" });
      }

      const parsedData = updateUserSchema.parse(req.body);
      const data = await adminService.updateUser(adminId, paramResult.data, parsedData);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  },

  async deleteUser(req: Request, res: Response, next: NextFunction) {
    try {
      // @ts-expect-error req.user is injected by authGuard
      const adminId = req.user.id;

      const paramResult = z.coerce.number().int().positive().safeParse(req.params.id);
      if (!paramResult.success) {
        return res.status(400).json({ error: "ID user tidak valid" });
      }

      const data = await adminService.deleteUser(adminId, paramResult.data);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  },
};
