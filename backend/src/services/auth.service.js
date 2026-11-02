import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

import { environment } from '../config/environment.js';
import {
  createUser,
  findUserByEmail,
  findUserById
} from '../repositories/user.repository.js';
import {
  isActiveUser,
  toPublicUser,
  USER_ROLES
} from '../models/user.model.js';

const accessTokenIssuer = 'nexora-api';
const accessTokenAudience = 'nexora-client';

const registrationSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(320),

    password: z
      .string()
      .min(8, 'Password must be at least 8 characters long.')
      .max(72, 'Password must not exceed 72 characters.'),

    firstName: z.string().trim().min(1).max(100),

    lastName: z.string().trim().min(1).max(100)
  })
  .strict();

const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(320),

    password: z
      .string()
      .min(1, 'Password is required.')
      .max(72, 'Password must not exceed 72 characters.')
  })
  .strict();

const accessTokenPayloadSchema = z
  .object({
    sub: z.string().uuid(),
    role: z.enum([USER_ROLES.CUSTOMER, USER_ROLES.ADMIN]),
    iat: z.number().optional(),
    exp: z.number().optional()
  })
  .strict();

export class AuthenticationError extends Error {
  constructor(message = 'Invalid authentication credentials.') {
    super(message);
    this.name = 'AuthenticationError';
    this.statusCode = 401;
    this.code = 'AUTHENTICATION_FAILED';
  }
}

export class RegistrationConflictError extends Error {
  constructor(message = 'An account with this email already exists.') {
    super(message);
    this.name = 'RegistrationConflictError';
    this.statusCode = 409;
    this.code = 'EMAIL_ALREADY_REGISTERED';
  }
}

const getJwtSecret = () => {
  if (!environment.JWT_SECRET) {
    throw new Error(
      'JWT_SECRET is not configured. Authentication cannot be used until it is set.'
    );
  }

  return environment.JWT_SECRET;
};

const normalizeRegistrationInput = (input) => {
  const validatedInput = registrationSchema.parse(input);

  return {
    email: validatedInput.email,
    password: validatedInput.password,
    firstName: validatedInput.firstName,
    lastName: validatedInput.lastName
  };
};

const normalizeLoginInput = (input) => loginSchema.parse(input);

const createAccessToken = (user) => {
  const secret = getJwtSecret();

  return jwt.sign(
    {
      sub: user.id,
      role: user.role
    },
    secret,
    {
      expiresIn: environment.JWT_EXPIRES_IN,
      issuer: accessTokenIssuer,
      audience: accessTokenAudience
    }
  );
};

export const registerUser = async (input) => {
  const registrationInput = normalizeRegistrationInput(input);

  const existingUser = await findUserByEmail(registrationInput.email);

  if (existingUser) {
    throw new RegistrationConflictError();
  }

  const passwordHash = await bcrypt.hash(
    registrationInput.password,
    environment.BCRYPT_ROUNDS
  );

  try {
    const user = await createUser({
      email: registrationInput.email,
      passwordHash,
      firstName: registrationInput.firstName,
      lastName: registrationInput.lastName
    });

    return {
      user: toPublicUser(user),
      accessToken: createAccessToken(user)
    };
  } catch (error) {
    if (error?.code === '23505') {
      throw new RegistrationConflictError();
    }

    throw error;
  }
};

export const loginUser = async (input) => {
  const loginInput = normalizeLoginInput(input);
  const user = await findUserByEmail(loginInput.email);

  if (!user || !isActiveUser(user)) {
    throw new AuthenticationError();
  }

  const passwordMatches = await bcrypt.compare(
    loginInput.password,
    user.passwordHash
  );

  if (!passwordMatches) {
    throw new AuthenticationError();
  }

  return {
    user: toPublicUser(user),
    accessToken: createAccessToken(user)
  };
};

export const verifyAccessToken = (token) => {
  if (typeof token !== 'string' || token.trim().length === 0) {
    throw new AuthenticationError();
  }

  try {
    const decodedToken = jwt.verify(token, getJwtSecret(), {
      issuer: accessTokenIssuer,
      audience: accessTokenAudience
    });

    return accessTokenPayloadSchema.parse(decodedToken);
  } catch {
    throw new AuthenticationError();
  }
};

export const getUserFromAccessToken = async (token) => {
  const tokenPayload = verifyAccessToken(token);
  const user = await findUserById(tokenPayload.sub);

  if (!user || !isActiveUser(user)) {
    throw new AuthenticationError();
  }

  return user;
};

export const getAuthenticatedUser = async (token) => {
  const user = await getUserFromAccessToken(token);

  return toPublicUser(user);
};

export const isAdmin = (user) =>
  Boolean(user && user.role === USER_ROLES.ADMIN);
