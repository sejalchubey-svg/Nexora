import {
  AuthenticationError,
  getAuthenticatedUser
} from '../services/auth.service.js';
import { USER_ROLES } from '../models/user.model.js';

const getBearerToken = (authorizationHeader) => {
  if (typeof authorizationHeader !== 'string') {
    return null;
  }

  const [scheme, token] = authorizationHeader.trim().split(/\s+/);

  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') {
    return null;
  }

  return token;
};

const sendUnauthorized = (response) => {
  response.status(401).json({
    success: false,
    error: {
      code: 'AUTHENTICATION_REQUIRED',
      message: 'Authentication is required to access this resource.'
    }
  });
};

const sendForbidden = (response) => {
  response.status(403).json({
    success: false,
    error: {
      code: 'INSUFFICIENT_PERMISSIONS',
      message: 'You do not have permission to access this resource.'
    }
  });
};

export const requireAuth = async (request, response, next) => {
  const token = getBearerToken(request.headers.authorization);

  if (!token) {
    sendUnauthorized(response);
    return;
  }

  try {
    const user = await getAuthenticatedUser(token);

    request.user = user;
    request.auth = {
      userId: user.id,
      role: user.role
    };

    next();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      sendUnauthorized(response);
      return;
    }

    next(error);
  }
};

export const optionalAuth = async (request, response, next) => {
  const authorizationHeader = request.headers.authorization;

  if (!authorizationHeader) {
    next();
    return;
  }

  const token = getBearerToken(authorizationHeader);

  if (!token) {
    sendUnauthorized(response);
    return;
  }

  try {
    const user = await getAuthenticatedUser(token);

    request.user = user;
    request.auth = {
      userId: user.id,
      role: user.role
    };

    next();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      sendUnauthorized(response);
      return;
    }

    next(error);
  }
};

export const requireRole = (...allowedRoles) => {
  if (allowedRoles.length === 0) {
    throw new Error('At least one allowed role is required.');
  }

  return (request, response, next) => {
    if (!request.user) {
      sendUnauthorized(response);
      return;
    }

    if (!allowedRoles.includes(request.user.role)) {
      sendForbidden(response);
      return;
    }

    next();
  };
};

export const requireAdmin = requireRole(USER_ROLES.ADMIN);

export const getAuthenticatedRequestUser = (request) => {
  if (!request.user) {
    throw new AuthenticationError();
  }

  return request.user;
};

export { getBearerToken };
