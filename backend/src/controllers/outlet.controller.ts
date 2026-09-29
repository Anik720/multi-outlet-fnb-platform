import type { Request, Response } from 'express';
import { outletService } from '../services/outlet.service';
import type { CreateOutletBody, ListOutletsQuery, UpdateOutletBody } from '../validators/outlet.validator';

type OutletParams = { outletId: string };

export const outletController = {
  async list(req: Request, res: Response) {
    res.json({ data: await outletService.list(req.valid.query as ListOutletsQuery) });
  },

  async getById(req: Request, res: Response) {
    const { outletId } = req.valid.params as OutletParams;
    res.json({ data: await outletService.getById(outletId) });
  },

  async create(req: Request, res: Response) {
    const outlet = await outletService.create(req.valid.body as CreateOutletBody);
    res.status(201).location(`${req.baseUrl}/${outlet.id}`).json({ data: outlet });
  },

  async update(req: Request, res: Response) {
    const { outletId } = req.valid.params as OutletParams;
    res.json({ data: await outletService.update(outletId, req.valid.body as UpdateOutletBody) });
  },
};
