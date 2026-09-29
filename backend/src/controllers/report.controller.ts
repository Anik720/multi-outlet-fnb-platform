import type { Request, Response } from 'express';
import { reportService } from '../services/report.service';
import type { RevenueReportQuery, TopItemsReportQuery } from '../validators/report.validator';

export const reportController = {
  async revenueByOutlet(req: Request, res: Response) {
    res.json({ data: await reportService.revenueByOutlet(req.valid.query as RevenueReportQuery) });
  },

  async topItems(req: Request, res: Response) {
    res.json({ data: await reportService.topItemsByOutlet(req.valid.query as TopItemsReportQuery) });
  },
};
