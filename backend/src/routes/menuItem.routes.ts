import { Router } from 'express';
import { menuItemController } from '../controllers/menuItem.controller';
import { authenticate, requireRole } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import {
  createMenuItemBody,
  listMenuItemsQuery,
  menuItemParams,
  updateMenuItemBody,
} from '../validators/menuItem.validator';

/** Master menu: HQ only. Outlets read their own menu via /outlets/:outletId/menu-items. */
export const menuItemRouter = Router();

menuItemRouter.use(authenticate, requireRole('HQ_ADMIN'));

menuItemRouter.get('/', validate({ query: listMenuItemsQuery }), menuItemController.list);
menuItemRouter.post('/', validate({ body: createMenuItemBody }), menuItemController.create);
menuItemRouter.get('/:menuItemId', validate({ params: menuItemParams }), menuItemController.getById);
menuItemRouter.patch(
  '/:menuItemId',
  validate({ params: menuItemParams, body: updateMenuItemBody }),
  menuItemController.update,
);
