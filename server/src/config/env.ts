import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0', ''])
  .optional()
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  APP_URL: z.string().url().default('http://localhost:5173'),
  API_URL: z.string().url().default('http://localhost:4000'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  /** 32+ random bytes (hex/base64). Used to encrypt MFA secrets and sign tracking tokens. */
  APP_SECRET: z.string().min(32, 'APP_SECRET must be at least 32 characters'),
  COOKIE_SECURE: bool,
  COOKIE_DOMAIN: z.string().optional().transform((v) => v || undefined),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 60).default(24 * 7),
  TRUST_PROXY: z.coerce.number().int().min(0).default(1),

  STORAGE_DRIVER: z.enum(['local', 'cloudinary']).default('local'),
  UPLOAD_DIR: z.string().default('uploads'),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  MAX_UPLOAD_MB: z.coerce.number().min(1).max(200).default(25),

  EMAIL_PROVIDER: z.enum(['none', 'smtp', 'resend']).default('none'),
  EMAIL_FROM: z.string().default('Maison Events <hello@example.com>'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_SECURE: bool,
  RESEND_API_KEY: z.string().optional(),

  WHATSAPP_PROVIDER: z.enum(['none', 'meta']).default('none'),
  WHATSAPP_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),

  PAYMENT_PROVIDER: z.enum(['sandbox', 'razorpay']).default('sandbox'),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  TURNSTILE_SECRET_KEY: z.string().optional(),
  AI_PROVIDER: z.enum(['none', 'anthropic']).default('none'),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-5-5'),

  JOBS_ENABLED: bool,
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const i of parsed.error.issues) console.error(`  ${i.path.join('.')}: ${i.message}`);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

if (isProd && env.PAYMENT_PROVIDER === 'sandbox') {
  console.error('PAYMENT_PROVIDER=sandbox is not allowed in production. Configure Razorpay credentials.');
  process.exit(1);
}
if (env.PAYMENT_PROVIDER === 'razorpay' && (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET)) {
  console.error('PAYMENT_PROVIDER=razorpay requires RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.');
  process.exit(1);
}
if (env.STORAGE_DRIVER === 'cloudinary' && (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET)) {
  console.error('STORAGE_DRIVER=cloudinary requires CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.');
  process.exit(1);
}
