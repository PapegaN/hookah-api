import { Injectable, UnauthorizedException } from '@nestjs/common';
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

  login(login: string, password: string): AuthResponse {
    const storedUser = this.platformDataService.findStoredUserByLogin(login);

    if (
      !storedUser ||
      !this.verifyPassword(password, storedUser.passwordHash)
    ) {
      throw new UnauthorizedException('Invalid login or password');
    }

    return this.issueSession(storedUser.id);
  }

  register(input: {
    login: string;
    password: string;
    email?: string;
    telegramUsername?: string;
  }): AuthResponse {
    const createdUser = this.platformDataService.registerClient({
      login: input.login,
      passwordHash: this.hashPassword(input.password),
      email: input.email,
      telegramUsername: input.telegramUsername,
    });

    return this.issueSession(createdUser.id);
  }

  createUserByAdmin(
    actorUserId: string,
    input: {
      login: string;
      password: string;
      role: UserRole;
      email?: string;
      telegramUsername?: string;
      isApproved?: boolean;
    },
  ): AppUser {
    return this.platformDataService.createUserByAdmin(actorUserId, {
      login: input.login,
      passwordHash: this.hashPassword(input.password),
      role: input.role,
      email: input.email,
      telegramUsername: input.telegramUsername,
      isApproved: input.isApproved ?? true,
    });
  }

  getUserByToken(token: string): AppUser | undefined {
    const userId = this.sessions.get(token);

    return userId
      ? this.platformDataService.findPublicUserById(userId)
      : undefined;
  }

  getAdminCredentialsHint(): { login: string; password: string } {
    return {
      login: 'admin',
      password: 'admin',
    };
  }

  getDemoAccounts(): Array<{
    login: string;
    password: string;
    role: UserRole;
  }> {
    return [
      { login: 'admin', password: 'admin', role: UserRole.Admin },
      { login: 'master', password: 'master', role: UserRole.HookahMaster },
      { login: 'client', password: 'client', role: UserRole.Client },
    ];
  }

  private issueSession(userId: string): AuthResponse {
    const accessToken = randomUUID();
    const user = this.platformDataService.findPublicUserById(userId);

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
