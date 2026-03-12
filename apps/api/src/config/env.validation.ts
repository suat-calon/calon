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

  REDIS_URL: Joi.string()
    .uri()
    .required(),

  JWT_SECRET: Joi.string()
    .min(32)
    .required(),

  IYZICO_WEBHOOK_SECRET: Joi.string()
    .min(10)
    .required(),

  LOG_LEVEL: Joi.string()
    .valid('debug', 'info', 'warn', 'error')
    .default('info'),

  SENTRY_DSN: Joi.string()
    .optional(),
});
