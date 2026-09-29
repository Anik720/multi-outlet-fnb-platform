import { Router } from 'express';
import { authRouter } from './auth.routes';
import { menuItemRouter } from './menuItem.routes';
import { outletRouter } from './outlet.routes';
import { reportRouter } from './report.routes';
import { healthController } from '../controllers/health.controller';

export const healthRouter = Router();
healthRouter.get('/', healthController.live);
healthRouter.get('/ready', healthController.ready);

export const apiRouter = Router();
apiRouter.use('/auth', authRouter);
apiRouter.use('/menu-items', menuItemRouter);
apiRouter.use('/outlets', outletRouter);
apiRouter.use('/reports', reportRouter);
