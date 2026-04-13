import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { DemoAuthService } from '../demo-auth.service';
import type { AuthenticatedRequest } from '../auth.types';

@Injectable()
export class DemoAuthGuard implements CanActivate {
  constructor(private readonly demoAuthService: DemoAuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorizationHeader = request.headers.authorization;

    if (!authorizationHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Authorization header is missing');
    }

    const accessToken = authorizationHeader.slice(7).trim();
    const user = this.demoAuthService.getUserByToken(accessToken);

    if (!user) {
      throw new UnauthorizedException('Access token is invalid');
    }

    request.user = user;

    return true;
  }
}
