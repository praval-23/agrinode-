import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';

export type AuthUser = { id: string; role: 'farmer' | 'buyer' | 'transporter' };
export type AuthenticatedRequest = Request & { user?: AuthUser };

export function authenticate(request: Request, response: Response, next: NextFunction): void {
  const header = request.header('authorization');
  if (!header) {
    if (env.auth.required) { response.status(401).json({ error: 'Authorization is required' }); return; }
    next();
    return;
  }
  const [scheme, token] = header.split(' ');
  const user = scheme?.toLowerCase() === 'bearer' && token ? env.auth.tokens.get(token) : undefined;
  if (!user) { response.status(401).json({ error: 'Invalid authorization token' }); return; }
  (request as AuthenticatedRequest).user = user;
  next();
}

export function currentUser(request: Request): AuthUser | undefined {
  return (request as AuthenticatedRequest).user;
}