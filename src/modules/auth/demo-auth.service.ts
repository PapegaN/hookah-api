import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import { PlatformDataService } from '../platform/platform-data.service';
import type { AppUser } from '../platform/platform.models';
import { UserRole } from '../platform/platform.models';
import type { AuthResponse } from './auth.types';

// Демо-авторизация доступна только в режиме разработки.
// В production эндпоинты с учётными данными демо-стенда отключены,
// чтобы исключить риск утечки паролей через служебные методы.
const DEMO_ALLOWED = process.env.NODE_ENV !== 'production';

@Injectable()
export class DemoAuthService {
  private readonly sessions = new Map<string, string>();

  constructor(private readonly platformDataService: PlatformDataService) {
    this.platformDataService.seedDemoUsers({
      admin: this.hashPassword('admin'),
      master: this.hashPassword('master'),
      client: this.hashPassword('client'),
    });
  }

  async login(login: string, password: string): Promise<AuthResponse> {
    const storedUser =
      await this.platformDataService.findStoredUserByLogin(login);

    if (
      !storedUser ||
      !this.verifyPassword(password, storedUser.passwordHash)
    ) {
      throw new UnauthorizedException('Invalid login or password');
    }

    return this.issueSession(storedUser.id);
  }

  async register(input: {
    login: string;
    password: string;
    email?: string;
    telegramUsername?: string;
  }): Promise<AuthResponse> {
    const createdUser = await this.platformDataService.registerClient({
      login: input.login,
      passwordHash: this.hashPassword(input.password),
      email: input.email,
      telegramUsername: input.telegramUsername,
    });

    return this.issueSession(createdUser.id);
  }

  async createUserByAdmin(
    actorUserId: string,
    input: {
      login: string;
      password: string;
      role: UserRole;
      email?: string;
      telegramUsername?: string;
      isApproved?: boolean;
    },
  ): Promise<AppUser> {
    return this.platformDataService.createUserByAdmin(actorUserId, {
      login: input.login,
      passwordHash: this.hashPassword(input.password),
      role: input.role,
      email: input.email,
      telegramUsername: input.telegramUsername,
      isApproved: input.isApproved ?? true,
    });
  }

  async getUserByToken(token: string): Promise<AppUser | undefined> {
    const userId = this.sessions.get(token);

    return userId
      ? await this.platformDataService.findPublicUserById(userId)
      : undefined;
  }

  /**
   * Возвращает учётные данные администратора только в development-окружении.
   * В production эндпоинт заблокирован во избежание утечки паролей.
   */
  getAdminCredentialsHint(): { login: string; password: string } {
    if (!DEMO_ALLOWED) {
      throw new ForbiddenException(
        'Admin credentials hint is unavailable in production',
      );
    }

    return {
      login: 'admin',
      password: 'admin',
    };
  }

  /**
   * Возвращает список демо-аккаунтов только в development-окружении.
   * В production эндпоинт заблокирован во избежание утечки паролей.
   */
  getDemoAccounts(): Array<{
    login: string;
    password: string;
    role: UserRole;
  }> {
    if (!DEMO_ALLOWED) {
      throw new ForbiddenException(
        'Demo accounts are unavailable in production',
      );
    }

    return [
      { login: 'admin', password: 'admin', role: UserRole.Admin },
      { login: 'master', password: 'master', role: UserRole.HookahMaster },
      { login: 'client', password: 'client', role: UserRole.Client },
    ];
  }

  private async issueSession(userId: string): Promise<AuthResponse> {
    const accessToken = randomUUID();
    const user = await this.platformDataService.findPublicUserById(userId);

    if (!user) {
      throw new UnauthorizedException('User session cannot be created');
    }

    this.sessions.set(accessToken, userId);

    return {
      accessToken,
      user,
    };
  }

  private hashPassword(password: string): string {
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(password, salt, 64).toString('hex');

    return `scrypt:${salt}:${hash}`;
  }

  private verifyPassword(password: string, encodedHash: string): boolean {
    const [algorithm, salt, expectedHash] = encodedHash.split(':');

    if (algorithm !== 'scrypt' || !salt || !expectedHash) {
      return false;
    }

    const actualHash = scryptSync(password, salt, 64).toString('hex');

    return timingSafeEqual(
      Buffer.from(actualHash, 'hex'),
      Buffer.from(expectedHash, 'hex'),
    );
  }
}
