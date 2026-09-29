import { Router } from 'express';
import { outletController } from '../controllers/outlet.controller';
import { outletMenuController } from '../controllers/outletMenu.controller';
import { inventoryController } from '../controllers/inventory.controller';
import { saleController } from '../controllers/sale.controller';
import { authenticate, authorizeOutlet, requireRole } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { createOutletBody, listOutletsQuery, updateOutletBody } from '../validators/outlet.validator';
import { outletParams } from '../validators/common';
import {
  assignMenuItemBody,
  listOutletMenuQuery,
  outletMenuItemParams,
} from '../validators/outletMenu.validator';
import {
  adjustInventoryBody,
  inventoryItemParams,
  listMovementsQuery,
} from '../validators/inventory.validator';
import { createSaleBody, listSalesQuery, saleParams } from '../validators/sale.validator';

const hqOnly = requireRole('HQ_ADMIN');

export const outletRouter = Router();
outletRouter.use(authenticate);

// ---- Outlets (HQ manages; staff may read their own) -------------------------
outletRouter.get('/', hqOnly, validate({ query: listOutletsQuery }), outletController.list);
outletRouter.post('/', hqOnly, validate({ body: createOutletBody }), outletController.create);
outletRouter.get('/:outletId', authorizeOutlet, validate({ params: outletParams }), outletController.getById);
outletRouter.patch(
  '/:outletId',
  hqOnly,
  validate({ params: outletParams, body: updateOutletBody }),
  outletController.update,
);

// ---- Outlet menu (HQ assigns; outlet reads only what is assigned to it) -----
outletRouter.get(
  '/:outletId/menu-items',
  authorizeOutlet,
  validate({ params: outletParams, query: listOutletMenuQuery }),
  outletMenuController.list,
);
outletRouter.put(
  '/:outletId/menu-items/:menuItemId',
  hqOnly,
  validate({ params: outletMenuItemParams, body: assignMenuItemBody }),
  outletMenuController.assign,
);
outletRouter.delete(
  '/:outletId/menu-items/:menuItemId',
  hqOnly,
  validate({ params: outletMenuItemParams }),
  outletMenuController.unassign,
);

// ---- Inventory (per outlet) --------------------------------------------------
outletRouter.get(
  '/:outletId/inventory',
  authorizeOutlet,
  validate({ params: outletParams }),
  inventoryController.list,
);
outletRouter.get(
  '/:outletId/inventory/movements',
  authorizeOutlet,
  validate({ params: outletParams, query: listMovementsQuery }),
  inventoryController.listMovements,
);
outletRouter.post(
  '/:outletId/inventory/:menuItemId/adjustments',
  authorizeOutlet,
  validate({ params: inventoryItemParams, body: adjustInventoryBody }),
  inventoryController.adjust,
);

// ---- Sales (per outlet) ------------------------------------------------------
outletRouter.post(
  '/:outletId/sales',
  authorizeOutlet,
  validate({ params: outletParams, body: createSaleBody }),
  saleController.create,
);
outletRouter.get(
  '/:outletId/sales',
  authorizeOutlet,
  validate({ params: outletParams, query: listSalesQuery }),
  saleController.list,
);
outletRouter.get('/:outletId/sales/:saleId', authorizeOutlet, validate({ params: saleParams }), saleController.getById);
