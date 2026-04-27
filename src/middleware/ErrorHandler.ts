import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

/**
 * Custom error interface for application-level errors.
 */
interface ApplicationError extends Error {
  status?: number;
  code?: string;
  details?: any;
}

/**
 * Centralized Express error handling middleware.
 *
 * - Handles known error types (Zod, Prisma, JWT, etc.)
 * - Provides formatted JSON responses with appropriate HTTP status
 * - Hides sensitive error details in production
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: Error | ApplicationError,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Default error values
  let status = 500;
  let code: string | undefined = undefined;
  let message = 'Internal server error';
  let details: any = undefined;

  // Handle validation errors (Zod)
  if (isZodError(err)) {
    status = 400;
    code = 'VALIDATION_ERROR';
    message = 'Invalid request payload';
    details = zodErrorsToArray(err);
  }
  // Handle Prisma errors (e.g., unique constraint)
  else if (isPrismaError(err)) {
    // Prisma error codes: https://www.prisma.io/docs/reference/api-reference/error-reference
    switch (err.code) {
      case 'P2002':
        status = 409;
        code = 'CONFLICT';
        message = 'A record with that field already exists';
        details = { target: err.meta?.target };
        break;
      case 'P2025':
        status = 404;
        code = 'NOT_FOUND';
        message = 'Resource not found';
        break;
      default:
        status = 500;
        code = 'PRISMA_ERROR';
        message = 'Database error';
    }
  }
  // JWT authentication errors
  else if (isJwtError(err)) {
    status = 401;
    code = 'UNAUTHORIZED';
    if (err.name === 'TokenExpiredError') {
      message = 'Token has expired';
    } else {
      message = 'Invalid or malformed token';
    }
  }
  // Custom error (application-defined)
  else if (err.status && typeof err.status === 'number' && err.message) {
    status = err.status;
    code = err.code || undefined;
    message = err.message;
    details = err.details || undefined;
  }
  // Fallback for general JS errors
  else if (err.message) {
    message = err.message;
  }

  // Strip sensitive stack trace unless in development
  const response: Record<string, any> = {
    code,
    message,
  };
  if (details) response.details = details;

  if (process.env.NODE_ENV === 'development') {
    response.stack = err.stack?.split('\n');
  }

  res.status(status).json(response);
}

// Type guards -----------------------------------------------------------------------------

function isZodError(err: any): err is ZodError {
  return err instanceof ZodError;
}

// Prisma client error "code" and "meta"
function isPrismaError(err: any): err is { code: string; meta?: any } {
  // Importing Prisma error types directly would tie middleware to Prisma.
  // Heuristic: If error has code and (code starts with P2), likely Prisma
  return (
    typeof err === 'object' &&
    (typeof err.code === 'string') &&
    /^P2\d{3}$/.test(err.code)
  );
}

function isJwtError(err: any): boolean {
  // JWT errors have name: 'JsonWebTokenError', 'TokenExpiredError', etc.
  if (
    typeof err === 'object' &&
    typeof err.name === 'string' &&
    (
      err.name === 'JsonWebTokenError' ||
      err.name === 'TokenExpiredError' ||
      err.name === 'NotBeforeError'
    )
  ) return true;
  return false;
}

// Zod error processing ----------------------------------------------------------------------
function zodErrorsToArray(error: ZodError) {
  return error.errors.map(({ path, message }) => ({
    path: path.join('.'),
    message,
  }));
}