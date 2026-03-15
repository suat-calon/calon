import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  // ── Core ──────────────────────────────────────────────────────────────────
  NODE_ENV: Joi.string()
    .valid('development', 'staging', 'production')
    .required(),

  PORT: Joi.number()
    .default(4000),

  // ── Database ──────────────────────────────────────────────────────────────
  DATABASE_URL: Joi.string()
    .uri()
    .required(),

  // ── Redis ─────────────────────────────────────────────────────────────────
  REDIS_HOST: Joi.string()
    .default('localhost'),

  REDIS_PORT: Joi.number()
    .default(6379),

  REDIS_PASSWORD: Joi.string()
    .optional()
    .allow(''),

  // ── Auth ──────────────────────────────────────────────────────────────────
  JWT_SECRET: Joi.string()
    .min(32)
    .required(),

  // ── Ödeme (Iyzico) ────────────────────────────────────────────────────────
  IYZICO_API_KEY: Joi.string()
    .min(10)
    .required(),

  IYZICO_SECRET_KEY: Joi.string()
    .min(10)
    .required(),

  IYZICO_BASE_URL: Joi.string()
    .uri()
    .default('https://sandbox-api.iyzipay.com'),

  IYZICO_CALLBACK_URL: Joi.string()
    .uri()
    .optional(),

  // ── Platform URL'leri ─────────────────────────────────────────────────────
  // Development default'ları var — production'da mutlaka override et.
  SITE_URL: Joi.string()
    .uri()
    .default('http://localhost:3000'),

  APP_URL: Joi.string()
    .uri()
    .default('http://localhost:3000'),

  BOOKING_URL: Joi.string()
    .uri()
    .default('http://localhost:3001'),

  API_URL: Joi.string()
    .uri()
    .default('http://localhost:4000'),

  // ── CORS ──────────────────────────────────────────────────────────────────
  // Virgülle ayrılmış origin listesi. Production'da gerçek domain'ler olmalı.
  CORS_ORIGIN: Joi.string()
    .default('http://localhost:3000,http://localhost:3001'),

  // ── Observability ─────────────────────────────────────────────────────────
  LOG_LEVEL: Joi.string()
    .valid('debug', 'info', 'warn', 'error')
    .default('info'),

  SENTRY_DSN: Joi.string()
    .optional(),

  // ── Super Admin ───────────────────────────────────────────────────────────
  // Opsiyonel — yoksa AdminGuard fail-closed (401) döner.
  ADMIN_API_KEY: Joi.string()
    .min(32)
    .optional(),

  // ── Rate Limiting (opsiyonel — default'ları var) ──────────────────────────
  PUBLIC_RATE_TTL_MS: Joi.number()
    .integer()
    .default(60_000),

  PUBLIC_HOLDS_LIMIT: Joi.number()
    .integer()
    .default(10),

  PUBLIC_BOOK_LIMIT: Joi.number()
    .integer()
    .default(5),

  // ── Archive ───────────────────────────────────────────────────────────────
  ARCHIVE_RETENTION_DAYS: Joi.number()
    .integer()
    .default(90),
}).unknown(true); // allow other env vars not listed here
