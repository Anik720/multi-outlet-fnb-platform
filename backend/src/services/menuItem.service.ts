import { menuItemRepository } from '../repositories/menuItem.repository';
import { toMenuItemDto } from '../mappers';
import { isUniqueViolation } from '../utils/dbErrors';
import { conflict, notFound } from '../utils/errors';
import { paginate } from '../utils/pagination';
import type {
  CreateMenuItemBody,
  ListMenuItemsQuery,
  UpdateMenuItemBody,
} from '../validators/menuItem.validator';

const toNumericString = (value: number) => value.toFixed(2);

export const menuItemService = {
  async list(query: ListMenuItemsQuery) {
    const { page, pageSize, ...filter } = query;
    const { rows, total } = await menuItemRepository.list(filter, { page, pageSize });
    return paginate(rows.map(toMenuItemDto), total, { page, pageSize });
  },

  async getById(id: string) {
    const item = await menuItemRepository.findById(id);
    if (!item) throw notFound('Menu item');
    return toMenuItemDto(item);
  },

  async create(body: CreateMenuItemBody) {
    try {
      const item = await menuItemRepository.create({ ...body, basePrice: toNumericString(body.basePrice) });
      return toMenuItemDto(item);
    } catch (err) {
      if (isUniqueViolation(err, 'menu_items_sku_uq')) throw conflict(`SKU "${body.sku}" is already in use`);
      throw err;
    }
  },

  async update(id: string, body: UpdateMenuItemBody) {
    if (!(await menuItemRepository.findById(id))) throw notFound('Menu item');
    const { basePrice, ...rest } = body;
    const item = await menuItemRepository.update(id, {
      ...rest,
      ...(basePrice !== undefined ? { basePrice: toNumericString(basePrice) } : {}),
    });
    return toMenuItemDto(item);
  },
};
