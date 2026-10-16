import { z } from 'zod';

/** Only same-origin, absolute paths are honoured for `?next=` (blocks `//evil.com` and `/\evil.com`). */
export function safeNext(next: string | null | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return null;
  if (/^\/(login|register|forgot-password|reset-password|verify-email)\b/.test(next)) return null;
  return next;
}

export const emailField = z.string().trim().min(1, 'Enter your email address').email('Enter a valid email address').max(160);

/** Mirrors the server rule (auth.service assertStrongPassword): 10+ characters with letters and numbers. */
export const newPasswordField = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(200, 'That password is too long')
  .refine((p) => /[a-zA-Z]/.test(p) && /\d/.test(p), 'Use both letters and numbers');

export interface Strength {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  hint: string;
}

export function passwordStrength(pw: string): Strength {
  if (!pw) return { score: 0, label: '', hint: 'At least 10 characters, with letters and numbers.' };
  let score = 0;
  if (pw.length >= 10) score++;
  if (pw.length >= 14) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^a-zA-Z0-9]/.test(pw)) score++;
  const meetsMinimum = pw.length >= 10 && /[a-zA-Z]/.test(pw) && /\d/.test(pw);
  if (!meetsMinimum) score = Math.min(score, 1);
  const s = Math.max(1, Math.min(4, score)) as Strength['score'];
  const label = ['', 'Weak', 'Fair', 'Good', 'Strong'][s];
  const hint = !meetsMinimum
    ? 'Needs at least 10 characters, including letters and numbers.'
    : s < 3
      ? 'Longer is stronger — try a short phrase, mixed case or a symbol.'
      : s === 3
        ? 'Good. A few more characters or a symbol makes it excellent.'
        : 'Excellent password.';
  return { score: s, label, hint };
}

/** Unsplash photography for the auth image panel (replaceable; CDN-sized via the Img component). */
export const AUTH_IMAGES = {
  login: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=2000&q=80',
  register: 'https://images.unsplash.com/photo-1469371670807-013ccf25f16a?auto=format&fit=crop&w=2000&q=80',
  reset: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=2000&q=80',
} as const;
