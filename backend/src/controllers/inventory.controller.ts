import type { Request, Response } from 'express';
import { inventoryService } from '../services/inventory.service';
import type { AdjustInventoryBody, ListMovementsQuery } from '../validators/inventory.validator';

type Params = { outletId: string; menuItemId: string };

export const inventoryController = {
  async list(req: Request, res: Response) {
    const { outletId } = req.valid.params as Pick<Params, 'outletId'>;
    res.json({ data: await inventoryService.list(outletId) });
  },

  async adjust(req: Request, res: Response) {
    const { outletId, menuItemId } = req.valid.params as Params;
    const row = await inventoryService.adjust(
      outletId,
      menuItemId,
      req.valid.body as AdjustInventoryBody,
      req.user!.id,
    );
    res.status(201).json({ data: row });
  },

  async listMovements(req: Request, res: Response) {
    const { outletId } = req.valid.params as Pick<Params, 'outletId'>;
    res.json({ data: await inventoryService.listMovements(outletId, req.valid.query as ListMovementsQuery) });
  },
};
