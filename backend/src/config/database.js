import pg from 'pg';

import { environment } from './environment.js';

const { Pool } = pg;

const buildPoolConfig = () => {
  const baseConfig = {
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    allowExitOnIdle: environment.NODE_ENV === 'test'
  };

  if (environment.DATABASE_URL) {
    return {
      ...baseConfig,
      connectionString: environment.DATABASE_URL,
      ssl: environment.DB_SSL
        ? {
            rejectUnauthorized: environment.NODE_ENV === 'production'
          }
        : false
    };
  }

  const hasDiscreteConfiguration =
    environment.DB_HOST &&
    environment.DB_NAME &&
    environment.DB_USER &&
    environment.DB_PASSWORD !== undefined;

  if (!hasDiscreteConfiguration) {
    throw new Error(
      'Database configuration is incomplete. Set DATABASE_URL or DB_HOST, DB_NAME, DB_USER, and DB_PASSWORD.'
    );
  }

  return {
    ...baseConfig,
    host: environment.DB_HOST,
    port: environment.DB_PORT,
    database: environment.DB_NAME,
    user: environment.DB_USER,
    password: environment.DB_PASSWORD,
    ssl: environment.DB_SSL
      ? {
          rejectUnauthorized: environment.NODE_ENV === 'production'
        }
      : false
  };
};

export const pool = new Pool(buildPoolConfig());

pool.on('error', () => {
  console.error('Unexpected PostgreSQL pool error.');
});

export const query = (text, parameters = []) =>
  pool.query(text, parameters);

export const getDatabaseClient = () => pool.connect();

export const closeDatabase = () => pool.end();
