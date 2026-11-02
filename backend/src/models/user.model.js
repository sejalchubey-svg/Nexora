import { z } from 'zod';

export const USER_ROLES = Object.freeze({
  CUSTOMER: 'customer',
  ADMIN: 'admin'
});

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(320);

const nameSchema = z
  .string()
  .trim()
  .min(1)
  .max(100);

const nullableDateSchema = z
  .union([z.coerce.date(), z.null()])
  .optional()
  .default(null);

export const userSchema = z.object({
  id: z.string().uuid(),

  email: emailSchema,

  passwordHash: z.string().min(1),

  firstName: nameSchema,
  lastName: nameSchema,

  role: z
    .enum([USER_ROLES.CUSTOMER, USER_ROLES.ADMIN])
    .default(USER_ROLES.CUSTOMER),

  isActive: z.boolean().default(true),

  emailVerifiedAt: nullableDateSchema,

  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),

  deletedAt: nullableDateSchema
});

export const createUserSchema = z.object({
  email: emailSchema,

  passwordHash: z.string().min(1),

  firstName: nameSchema,
  lastName: nameSchema,

  role: z
    .enum([USER_ROLES.CUSTOMER, USER_ROLES.ADMIN])
    .default(USER_ROLES.CUSTOMER)
});

export const updateUserSchema = z
  .object({
    email: emailSchema.optional(),

    firstName: nameSchema.optional(),
    lastName: nameSchema.optional(),

    role: z
      .enum([USER_ROLES.CUSTOMER, USER_ROLES.ADMIN])
      .optional(),

    isActive: z.boolean().optional(),

    emailVerifiedAt: nullableDateSchema
  })
  .strict();

export const publicUserSchema = userSchema
  .omit({
    passwordHash: true,
    deletedAt: true
  })
  .extend({
    emailVerified: z.boolean()
  });

export const mapUserRow = (row) => {
  if (!row) {
    return null;
  }

  return userSchema.parse({
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    firstName: row.first_name,
    lastName: row.last_name,
    role: row.role,
    isActive: row.is_active,
    emailVerifiedAt: row.email_verified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at
  });
};

export const mapUserToPersistence = (user) => {
  const validatedUser = createUserSchema.parse(user);

  return {
    email: validatedUser.email,
    passwordHash: validatedUser.passwordHash,
    firstName: validatedUser.firstName,
    lastName: validatedUser.lastName,
    role: validatedUser.role
  };
};

export const toPublicUser = (user) => {
  const validatedUser = userSchema.parse(user);

  return publicUserSchema.parse({
    id: validatedUser.id,
    email: validatedUser.email,
    firstName: validatedUser.firstName,
    lastName: validatedUser.lastName,
    role: validatedUser.role,
    isActive: validatedUser.isActive,
    emailVerifiedAt: validatedUser.emailVerifiedAt,
    createdAt: validatedUser.createdAt,
    updatedAt: validatedUser.updatedAt,
    emailVerified: Boolean(validatedUser.emailVerifiedAt)
  });
};

export const getUserDisplayName = (user) => {
  const validatedUser = userSchema.parse(user);

  return `${validatedUser.firstName} ${validatedUser.lastName}`.trim();
};

export const isAdminUser = (user) => {
  const validatedUser = userSchema.parse(user);

  return validatedUser.role === USER_ROLES.ADMIN;
};

export const isActiveUser = (user) => {
  const validatedUser = userSchema.parse(user);

  return validatedUser.isActive && !validatedUser.deletedAt;
};
