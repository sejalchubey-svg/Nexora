import { AuthenticationError } from '../services/auth.service.js';
import {
  loginUser,
  registerUser
} from '../services/auth.service.js';

const disableCaching = (response) => {
  response.set('Cache-Control', 'no-store');
};

export const register = async (request, response, next) => {
  try {
    const result = await registerUser(request.body);

    disableCaching(response);

    response.status(201).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (request, response, next) => {
  try {
    const result = await loginUser(request.body);

    disableCaching(response);

    response.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

export const getCurrentUser = async (request, response, next) => {
  try {
    if (!request.user) {
      throw new AuthenticationError();
    }

    disableCaching(response);

    response.status(200).json({
      success: true,
      data: {
        user: request.user
      }
    });
  } catch (error) {
    next(error);
  }
};

export const logout = async (_request, response) => {
  disableCaching(response);

  response.status(204).send();
};
