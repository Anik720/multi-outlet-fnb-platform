import { z } from 'zod';

export const paginationQuery = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};

export interface Pagination {
  page: number;
  pageSize: number;
}

export interface Paginated<T> {
  data: T[];
  pagination: Pagination & { total: number; totalPages: number };
}

export const toOffset = ({ page, pageSize }: Pagination) => (page - 1) * pageSize;

export function paginate<T>(data: T[], total: number, p: Pagination): Paginated<T> {
  return {
    data,
    pagination: { ...p, total, totalPages: Math.ceil(total / p.pageSize) },
  };
}
