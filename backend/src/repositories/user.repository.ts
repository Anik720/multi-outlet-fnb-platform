import { prisma, type Db } from '../db/prisma';
import type { User } from '../generated/prisma/client';

export const userRepository = {
  /** Case-insensitive lookup that uses the users_email_lower_uq index. */
  async findByEmail(email: string, db: Db = prisma): Promise<User | null> {
    const rows = await db.$queryRaw<{ id: string }[]>`
      SELECT id FROM users WHERE lower(email) = lower(${email}) LIMIT 1`;
    const id = rows[0]?.id;
    return id ? db.user.findUnique({ where: { id } }) : null;
  },

  findById(id: string, db: Db = prisma): Promise<User | null> {
    return db.user.findUnique({ where: { id } });
  },
};
