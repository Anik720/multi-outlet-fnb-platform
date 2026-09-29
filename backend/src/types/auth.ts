export const ROLES = ['HQ_ADMIN', 'OUTLET_STAFF'] as const;
export type Role = (typeof ROLES)[number];

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  /** Only set for OUTLET_STAFF. */
  outletId: string | null;
}
