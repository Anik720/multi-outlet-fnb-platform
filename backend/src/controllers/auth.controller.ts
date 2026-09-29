import type { Request, Response } from 'express';
import { authService } from '../services/auth.service';
import type { LoginBody } from '../validators/auth.validator';

export const authController = {
  async login(req: Request, res: Response) {
    const result = await authService.login(req.valid.body as LoginBody);
    res.json({ data: result });
  },

  async me(req: Request, res: Response) {
    res.json({ data: await authService.me(req.user!.id) });
  },
};
