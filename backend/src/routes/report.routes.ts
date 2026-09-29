import { Router } from 'express';
import { reportController } from '../controllers/report.controller';
import { authenticate, requireRole } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { revenueReportQuery, topItemsReportQuery } from '../validators/report.validator';

/** Company-wide reporting: HQ only. */
export const reportRouter = Router();

reportRouter.use(authenticate, requireRole('HQ_ADMIN'));

reportRouter.get('/revenue-by-outlet', validate({ query: revenueReportQuery }), reportController.revenueByOutlet);
reportRouter.get('/top-items', validate({ query: topItemsReportQuery }), reportController.topItems);
