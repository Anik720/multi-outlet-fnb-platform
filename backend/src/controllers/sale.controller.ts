import type { Request, Response } from 'express';
import { saleService } from '../services/sale.service';
import { validationError } from '../utils/errors';
import {
  idempotencyKeyHeader,
  type CreateSaleBody,
  type ListSalesQuery,
} from '../validators/sale.validator';

type Params = { outletId: string; saleId: string };

export const saleController = {
  async create(req: Request, res: Response) {
    const { outletId } = req.valid.params as Pick<Params, 'outletId'>;

    const rawKey = req.get('Idempotency-Key');
    let idempotencyKey: string | undefined;
    if (rawKey !== undefined) {
      const parsed = idempotencyKeyHeader.safeParse(rawKey);
      if (!parsed.success) {
        throw validationError(
          parsed.error.issues.map((i) => ({ location: 'headers', path: 'Idempotency-Key', message: i.message })),
        );
      }
      idempotencyKey = parsed.data;
    }

    const { sale, replayed } = await saleService.create(
      outletId,
      req.valid.body as CreateSaleBody,
      req.user!,
      idempotencyKey,
    );

    if (replayed) res.set('Idempotent-Replayed', 'true');
    res
      .status(replayed ? 200 : 201)
      .location(`${req.baseUrl}/${sale.id}`)
      .json({ data: sale });
  },

  async getById(req: Request, res: Response) {
    const { outletId, saleId } = req.valid.params as Params;
    res.json({ data: await saleService.getById(outletId, saleId) });
  },

  async list(req: Request, res: Response) {
    const { outletId } = req.valid.params as Pick<Params, 'outletId'>;
    res.json(await saleService.list(outletId, req.valid.query as ListSalesQuery));
  },
};
