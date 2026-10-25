import type { NextFunction, Request, RequestHandler, Response } from 'express';

export type Role = 'admin' | 'user' | 'guest';

export interface AuthUser {
  username: string;
  role: Role;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export class HttpError extends Error {
  constructor(
    public readonly status: 401 | 403 | 500,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const authorize = (...allowed: Role[]): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const { user } = req as AuthenticatedRequest;
      if (!user) {
        throw new HttpError(401, 'unauthorized');
      }
      if (allowed.length > 0 && !allowed.includes(user.role)) {
        throw new HttpError(403, 'forbidden');
      }
      next();
    } catch (err) {
      next(err);
    }
  };

export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'internal server error' });
};
