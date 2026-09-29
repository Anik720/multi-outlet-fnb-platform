import type { Request, Response } from 'express';
import { menuItemService } from '../services/menuItem.service';
import type {
  CreateMenuItemBody,
  ListMenuItemsQuery,
  UpdateMenuItemBody,
} from '../validators/menuItem.validator';

type MenuItemParams = { menuItemId: string };

export const menuItemController = {
  async list(req: Request, res: Response) {
    res.json(await menuItemService.list(req.valid.query as ListMenuItemsQuery));
  },

  async getById(req: Request, res: Response) {
    const { menuItemId } = req.valid.params as MenuItemParams;
    res.json({ data: await menuItemService.getById(menuItemId) });
  },

  async create(req: Request, res: Response) {
    const item = await menuItemService.create(req.valid.body as CreateMenuItemBody);
    res.status(201).location(`${req.baseUrl}/${item.id}`).json({ data: item });
  },

  async update(req: Request, res: Response) {
    const { menuItemId } = req.valid.params as MenuItemParams;
    res.json({ data: await menuItemService.update(menuItemId, req.valid.body as UpdateMenuItemBody) });
  },
};
