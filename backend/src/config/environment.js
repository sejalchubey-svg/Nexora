import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const booleanFromEnv = (defaultValue) =>
  z.preprocess((value) => {
    if (value === undefined || value === '') {
      return defaultValue;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();

      if (['true', '1', 'yes', 'on'].includes(normalized)) {
        return true;
      }

      if (['false', '0', 'no', 'off'].includes(normalized)) {
        return false;
      }
    }

    return value;
  }, z.boolean());

const positiveInteger = (
  defaultValue,
  minimum = 1,
  maximum = Number.MAX_SAFE_INTEGER
) =>
  z.coerce
    .number()
    .int()
    .min(minimum)
    .max(maximum)
    .default(defaultValue);

const environmentSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),

    HOST: z.string().trim().min(1).default('0.0.0.0'),

    PORT: positiveInteger(3000, 1, 65535),

    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    CORS_ORIGIN: z
      .string()
      .trim()
      .min(1)
      .default('http://localhost:5173' ),

    TRUST_PROXY: booleanFromEnv(false),

    COOKIE_SECURE: booleanFromEnv(false),

    JWT_SECRET: z.string().trim().min(32).optional(),

    JWT_EXPIRES_IN: z.string().trim().min(1).default('15m'),

    BCRYPT_ROUNDS: positiveInteger(12, 8, 15),

    DATABASE_URL: z.string().trim().url().optional(),

    DB_HOST: z.string().trim().min(1).optional(),

    DB_PORT: positiveInteger(5432, 1, 65535),

    DB_NAME: z.string().trim().min(1).optional(),

    DB_USER: z.string().trim().min(1).optional(),

    DB_PASSWORD: z.string().optional(),

    DB_SSL: booleanFromEnv(false)
  })
  .superRefine((values, context) => {
    const hasDatabaseUrl = Boolean(values.DATABASE_URL);

    const hasDiscreteDatabaseConfig = Boolean(
      values.DB_HOST &&
        values.DB_NAME &&
        values.DB_USER &&
        values.DB_PASSWORD !== undefined
    );

    if (
      values.NODE_ENV === 'production' &&
      !hasDatabaseUrl &&
      !hasDiscreteDatabaseConfig
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DATABASE_URL'],
        message:
          'Set DATABASE_URL or DB_HOST, DB_NAME, DB_USER, and DB_PASSWORD in production.'
      });
    }

    if (values.NODE_ENV === 'production' && !values.JWT_SECRET) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_SECRET'],
        message: 'JWT_SECRET is required in production.'
      });
    }

    if (values.NODE_ENV === 'production' && !values.COOKIE_SECURE) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['COOKIE_SECURE'],
        message: 'COOKIE_SECURE must be true in production.'
      });
    }
  });

const formatValidationError = (error) =>
  error.issues
    .map(
      (issue) =>
        `${issue.path.join('.') || 'environment'}: ${issue.message}`
    )
    .join('; ');

export const loadEnvironment = (source = process.env) => {
  const result = environmentSchema.safeParse(source);

  if (!result.success) {
    throw new Error(
      `Invalid environment configuration: ${formatValidationError(result.error)}`
    );
  }

  return {
    ...result.data,

    CORS_ORIGINS: result.data.CORS_ORIGIN.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
  };
};

export const environment = loadEnvironment();
