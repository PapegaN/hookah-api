import type { Request } from 'express';
import type { AppUser } from '../platform/platform.models';

export interface AuthenticatedRequest extends Request {
  user: AppUser;
}

export interface AuthResponse {
  accessToken: string;
  user: AppUser;
}
