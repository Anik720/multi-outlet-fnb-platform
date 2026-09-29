import { prisma, type Db } from '../db/prisma';
import type { Outlet } from '../generated/prisma/client';

export interface OutletFilter {
  isActive?: boolean;
}

export interface CreateOutletData {
  code: string;
  name: string;
  address?: string | null;
}

export interface UpdateOutletData {
  name?: string;
  address?: string | null;
  isActive?: boolean;
}

export const outletRepository = {
  list(filter: OutletFilter, db: Db = prisma): Promise<Outlet[]> {
    return db.outlet.findMany({
      where: { isActive: filter.isActive },
      orderBy: { code: 'asc' },
    });
  },

  findById(id: string, db: Db = prisma): Promise<Outlet | null> {
    return db.outlet.findUnique({ where: { id } });
  },

  findByCode(code: string, db: Db = prisma): Promise<Outlet | null> {
    return db.outlet.findUnique({ where: { code } });
  },

  /** Creates the outlet together with its receipt counter (starts at 0). */
  create(data: CreateOutletData, db: Db = prisma): Promise<Outlet> {
    return db.outlet.create({
      data: { ...data, receiptCounter: { create: {} } },
    });
  },

  update(id: string, data: UpdateOutletData, db: Db = prisma): Promise<Outlet> {
    return db.outlet.update({ where: { id }, data });
  },
};
