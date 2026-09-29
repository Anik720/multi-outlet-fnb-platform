import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authController } from '../controllers/auth.controller';
import { authenticate } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { loginBody } from '../validators/auth.validator';
import { isTest } from '../config/env';

// Brute-force protection on the only unauthenticated write endpoint.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => isTest,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Too many login attempts, try again later' } },
});

export const authRouter = Router();

authRouter.post('/login', loginLimiter, validate({ body: loginBody }), authController.login);
authRouter.get('/me', authenticate, authController.me);
