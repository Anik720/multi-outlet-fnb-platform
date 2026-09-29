import type { Request, Response } from 'express';
import { prisma } from '../db/prisma';

export const healthController = {
  /** Liveness: the process is up. */
  live(_req: Request, res: Response) {
    res.json({ status: 'ok', uptime: Math.round(process.uptime()) });
  },

  /** Readiness: the process can serve traffic (database reachable). */
  async ready(_req: Request, res: Response) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', database: 'up' });
    } catch {
      res.status(503).json({ status: 'unavailable', database: 'down' });
    }
  },
};
