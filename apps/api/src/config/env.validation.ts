import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'staging', 'production')
    .required(),

  PORT: Joi.number()
    .default(3000),

  DATABASE_URL: Joi.string()
    .uri()
    .required(),

  REDIS_HOST: Joi.string()
    .default('localhost'),

  REDIS_PORT: Joi.number()
    .default(6379),

  REDIS_PASSWORD: Joi.string()
    .optional()
    .allow(''),

  JWT_SECRET: Joi.string()
    .min(32)
    .required(),

  IYZICO_SECRET_KEY: Joi.string()
    .min(10)
    .required(),

  LOG_LEVEL: Joi.string()
    .valid('debug', 'info', 'warn', 'error')
    .default('info'),

  SENTRY_DSN: Joi.string()
    .optional(),

  // ── Faz 5: Super Admin Platform ──────────────────────────────────────────
  // Opsiyonel — yoksa AdminGuard fail-closed (401) döner.
  ADMIN_API_KEY: Joi.string()
    .min(32)
    .optional(),
}).unknown(true); // allow other env vars not listed here
