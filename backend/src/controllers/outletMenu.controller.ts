import type { Request, Response } from 'express';
import { outletMenuService } from '../services/outletMenu.service';
import type { AssignMenuItemBody, ListOutletMenuQuery } from '../validators/outletMenu.validator';

type Params = { outletId: string; menuItemId: string };

export const outletMenuController = {
  async list(req: Request, res: Response) {
    const { outletId } = req.valid.params as Pick<Params, 'outletId'>;
    res.json({ data: await outletMenuService.list(outletId, req.valid.query as ListOutletMenuQuery) });
  },

  async assign(req: Request, res: Response) {
    const { outletId, menuItemId } = req.valid.params as Params;
    const { created, item } = await outletMenuService.assign(
      outletId,
      menuItemId,
      req.valid.body as AssignMenuItemBody,
    );
    res.status(created ? 201 : 200).json({ data: item });
  },

  async unassign(req: Request, res: Response) {
    const { outletId, menuItemId } = req.valid.params as Params;
    await outletMenuService.unassign(outletId, menuItemId);
    res.status(204).end();
  },
};
