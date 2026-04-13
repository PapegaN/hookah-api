import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AppUser } from '../../platform/platform.models';
import type { AuthenticatedRequest } from '../auth.types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AppUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    return request.user;
  },
);
