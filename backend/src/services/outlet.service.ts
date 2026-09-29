import { outletRepository } from '../repositories/outlet.repository';
import { toOutletDto } from '../mappers';
import { isUniqueViolation } from '../utils/dbErrors';
import { conflict, notFound } from '../utils/errors';
import type { CreateOutletBody, ListOutletsQuery, UpdateOutletBody } from '../validators/outlet.validator';

export const outletService = {
  async list(query: ListOutletsQuery) {
    const outlets = await outletRepository.list({ isActive: query.isActive });
    return outlets.map(toOutletDto);
  },

  async getById(id: string) {
    const outlet = await outletRepository.findById(id);
    if (!outlet) throw notFound('Outlet');
    return toOutletDto(outlet);
  },

  /** Throws 404 unless the outlet exists. Optionally requires it to be active. */
  async assertExists(id: string, opts: { active?: boolean } = {}) {
    const outlet = await outletRepository.findById(id);
    if (!outlet) throw notFound('Outlet');
    if (opts.active && !outlet.isActive) throw conflict('Outlet is inactive');
    return outlet;
  },

  async create(body: CreateOutletBody) {
    try {
      const outlet = await outletRepository.create(body);
      return toOutletDto(outlet);
    } catch (err) {
      if (isUniqueViolation(err, 'outlets_code_uq')) {
        throw conflict(`Outlet code "${body.code}" is already in use`);
      }
      throw err;
    }
  },

  async update(id: string, body: UpdateOutletBody) {
    await outletService.assertExists(id);
    const outlet = await outletRepository.update(id, body);
    return toOutletDto(outlet);
  },
};
