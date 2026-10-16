import rateLimit from 'express-rate-limit';
import { isTest } from '../config/env';

const make = (windowMs: number, limit: number, message: string) =>
  rateLimit({
    windowMs,
    limit: isTest ? 10_000 : limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message } },
  });

export const apiLimiter = make(60_000, 300, 'Too many requests. Please slow down.');
export const authLimiter = make(15 * 60_000, 20, 'Too many sign-in attempts. Try again in a few minutes.');
export const formLimiter = make(60 * 60_000, 15, 'Too many submissions from this network. Please try again later or contact us directly.');
export const paymentLimiter = make(15 * 60_000, 30, 'Too many payment attempts. Please wait a few minutes.');
