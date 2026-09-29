import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import type { TokenPayload } from '../middlewares/auth';
import { userRepository } from '../repositories/user.repository';
import { toUserDto } from '../mappers';
import { AppError } from '../utils/errors';
import type { LoginBody } from '../validators/auth.validator';

// Compared against when the user doesn't exist, so response timing doesn't
// reveal which emails are registered.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

const invalidCredentials = () => new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');

export const authService = {
  async login({ email, password }: LoginBody) {
    const user = await userRepository.findByEmail(email);
    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) throw invalidCredentials();
    if (!user.isActive) throw new AppError(403, 'ACCOUNT_DISABLED', 'This account has been disabled');

    const payload: TokenPayload = {
      sub: user.id,
      email: user.email,
      name: user.fullName,
      role: user.role,
      outletId: user.outletId,
    };
    const token = jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
    });
    return { token, user: toUserDto(user) };
  },

  async me(userId: string) {
    const user = await userRepository.findById(userId);
    // A validly signed token for a user that no longer exists (e.g. after a re-seed) is a dead session, not a 404.
    if (!user) throw new AppError(401, 'SESSION_INVALID', 'Your session is no longer valid, please sign in again');
    return toUserDto(user);
  },
};
