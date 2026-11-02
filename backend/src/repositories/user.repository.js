import { z } from 'zod';

import { query } from '../config/database.js';
import {
  createUserSchema,
  mapUserRow,
  mapUserToPersistence,
  updateUserSchema
} from '../models/user.model.js';

const userIdSchema = z.string().uuid();

const passwordHashSchema = z.string().trim().min(1);

const normalizeEmail = (email) =>
  z
    .string()
    .trim()
    .toLowerCase()
    .email()
    .max(320)
    .parse(email);

const mapUserColumns = (row) => ({
  id: row.id,
  email: row.email,
  password_hash: row.password_hash,
  first_name: row.first_name,
  last_name: row.last_name,
  role: row.role,
  is_active: row.is_active,
  email_verified_at: row.email_verified_at,
  created_at: row.created_at,
  updated_at: row.updated_at,
  deleted_at: row.deleted_at
});

export const createUser = async (input) => {
  const user = createUserSchema.parse(input);
  const persistenceUser = mapUserToPersistence(user);

  const result = await query(
    `
      INSERT INTO users (
        email,
        password_hash,
        first_name,
        last_name,
        role
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING
        id,
        email,
        password_hash,
        first_name,
        last_name,
        role,
        is_active,
        email_verified_at,
        created_at,
        updated_at,
        deleted_at
    `,
    [
      persistenceUser.email,
      persistenceUser.passwordHash,
      persistenceUser.firstName,
      persistenceUser.lastName,
      persistenceUser.role
    ]
  );

  return mapUserRow(mapUserColumns(result.rows[0]));
};

export const findUserById = async (id) => {
  const userId = userIdSchema.parse(id);

  const result = await query(
    `
      SELECT
        id,
        email,
        password_hash,
        first_name,
        last_name,
        role,
        is_active,
        email_verified_at,
        created_at,
        updated_at,
        deleted_at
      FROM users
      WHERE id = $1
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [userId]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapUserRow(mapUserColumns(result.rows[0]));
};

export const findUserByEmail = async (email) => {
  const normalizedEmail = normalizeEmail(email);

  const result = await query(
    `
      SELECT
        id,
        email,
        password_hash,
        first_name,
        last_name,
        role,
        is_active,
        email_verified_at,
        created_at,
        updated_at,
        deleted_at
      FROM users
      WHERE LOWER(email) = LOWER($1)
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [normalizedEmail]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapUserRow(mapUserColumns(result.rows[0]));
};

export const updateUser = async (id, input) => {
  const userId = userIdSchema.parse(id);
  const update = updateUserSchema.parse(input);

  const requestedFields = new Set(Object.keys(input));

  const updateColumns = [];
  const updateValues = [];

  const addColumn = (column, value) => {
    updateColumns.push(column);
    updateValues.push(value);
  };

  if (requestedFields.has('email')) {
    addColumn('email', normalizeEmail(update.email));
  }

  if (requestedFields.has('firstName')) {
    addColumn('first_name', update.firstName);
  }

  if (requestedFields.has('lastName')) {
    addColumn('last_name', update.lastName);
  }

  if (requestedFields.has('role')) {
    addColumn('role', update.role);
  }

  if (requestedFields.has('isActive')) {
    addColumn('is_active', update.isActive);
  }

  if (requestedFields.has('emailVerifiedAt')) {
    addColumn('email_verified_at', update.emailVerifiedAt);
  }

  if (updateColumns.length === 0) {
    throw new Error('At least one user field is required for an update.');
  }

  const setClause = updateColumns
    .map((column, index) => `${column} = $${index + 1}`)
    .join(', ');

  const userIdParameterIndex = updateValues.length + 1;
  updateValues.push(userId);

  const result = await query(
    `
      UPDATE users
      SET ${setClause}
      WHERE id = $${userIdParameterIndex}
        AND deleted_at IS NULL
      RETURNING
        id,
        email,
        password_hash,
        first_name,
        last_name,
        role,
        is_active,
        email_verified_at,
        created_at,
        updated_at,
        deleted_at
    `,
    updateValues
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapUserRow(mapUserColumns(result.rows[0]));
};

export const updatePasswordHash = async (id, passwordHash) => {
  const userId = userIdSchema.parse(id);
  const validatedPasswordHash = passwordHashSchema.parse(passwordHash);

  const result = await query(
    `
      UPDATE users
      SET password_hash = $1
      WHERE id = $2
        AND deleted_at IS NULL
      RETURNING
        id,
        email,
        password_hash,
        first_name,
        last_name,
        role,
        is_active,
        email_verified_at,
        created_at,
        updated_at,
        deleted_at
    `,
    [validatedPasswordHash, userId]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapUserRow(mapUserColumns(result.rows[0]));
};

export const markEmailAsVerified = async (id) => {
  const userId = userIdSchema.parse(id);

  const result = await query(
    `
      UPDATE users
      SET email_verified_at = COALESCE(email_verified_at, NOW())
      WHERE id = $1
        AND deleted_at IS NULL
      RETURNING
        id,
        email,
        password_hash,
        first_name,
        last_name,
        role,
        is_active,
        email_verified_at,
        created_at,
        updated_at,
        deleted_at
    `,
    [userId]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapUserRow(mapUserColumns(result.rows[0]));
};

export const deactivateUser = async (id) => {
  const userId = userIdSchema.parse(id);

  const result = await query(
    `
      UPDATE users
      SET
        is_active = FALSE,
        deleted_at = NOW()
      WHERE id = $1
        AND deleted_at IS NULL
      RETURNING
        id,
        email,
        password_hash,
        first_name,
        last_name,
        role,
        is_active,
        email_verified_at,
        created_at,
        updated_at,
        deleted_at
    `,
    [userId]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapUserRow(mapUserColumns(result.rows[0]));
};
