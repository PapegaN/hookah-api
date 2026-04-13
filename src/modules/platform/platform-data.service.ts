import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { MemoryPlatformStore } from './memory-platform.store';
import type {
  AppUser,
  BowlReference,
  CharcoalReference,
  HookahReference,
  KalaudReference,
  OrderView,
  ReferencesSnapshot,
  StoredUser,
  TobaccoReference,
  UpsertReferencePayload,
} from './platform.models';
import { ReferenceEntityType, UserRole } from './platform.models';
import { PostgresPlatformStore } from './postgres-platform.store';

@Injectable()
export class PlatformDataService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly memoryPlatformStore: MemoryPlatformStore,
    private readonly postgresPlatformStore: PostgresPlatformStore,
  ) {}

  seedDemoUsers(hashes: {
    admin: string;
    master: string;
    client: string;
  }): void {
    if (!this.databaseService.isEnabled()) {
      this.memoryPlatformStore.seedDemoUsers(hashes);
    }
  }

  async findStoredUserByLogin(login: string): Promise<StoredUser | undefined> {
    return this.databaseService.isEnabled()
      ? await this.postgresPlatformStore.findStoredUserByLogin(login)
      : this.memoryPlatformStore.findStoredUserByLogin(login);
  }

  async findStoredUserById(id: string): Promise<StoredUser | undefined> {
    return this.databaseService.isEnabled()
      ? await this.postgresPlatformStore.findStoredUserById(id)
      : this.memoryPlatformStore.findStoredUserById(id);
  }

  async findPublicUserById(id: string): Promise<AppUser | undefined> {
    return this.databaseService.isEnabled()
      ? await this.postgresPlatformStore.findPublicUserById(id)
      : this.memoryPlatformStore.findPublicUserById(id);
  }

  async listUsers(): Promise<AppUser[]> {
    return this.databaseService.isEnabled()
      ? await this.postgresPlatformStore.listUsers()
      : this.memoryPlatformStore.listUsers();
  }

  async registerClient(input: {
    login: string;
    passwordHash: string;
    email: string | undefined;
    telegramUsername: string | undefined;
  }): Promise<AppUser> {
    return this.databaseService.isEnabled()
      ? await this.postgresPlatformStore.registerClient(input)
      : this.memoryPlatformStore.registerClient(input);
  }

  async createUserByAdmin(
    actorUserId: string,
    input: {
      login: string;
      passwordHash: string;
      role: UserRole;
      email: string | undefined;
      telegramUsername: string | undefined;
      isApproved: boolean;
    },
  ): Promise<AppUser> {
    return this.databaseService.isEnabled()
      ? await this.postgresPlatformStore.createUserByAdmin(actorUserId, input)
      : this.memoryPlatformStore.createUserByAdmin(actorUserId, input);
  }

  async updateUser(
    actorUserId: string,
    userId: string,
    payload: Partial<
      Pick<
        AppUser,
        'login' | 'role' | 'email' | 'telegramUsername' | 'isApproved'
      >
    >,
  ): Promise<AppUser> {
    return this.databaseService.isEnabled()
      ? await this.postgresPlatformStore.updateUser(
          actorUserId,
          userId,
          payload,
        )
      : this.memoryPlatformStore.updateUser(actorUserId, userId, payload);
  }

  async getReferencesSnapshot(): Promise<ReferencesSnapshot> {
    return this.databaseService.isEnabled()
      ? await this.postgresPlatformStore.getReferencesSnapshot()
      : this.memoryPlatformStore.getReferencesSnapshot();
  }

  async createReference(
    type: ReferenceEntityType,
    payload: UpsertReferencePayload,
  ): Promise<
    | TobaccoReference
    | HookahReference
    | BowlReference
    | KalaudReference
    | CharcoalReference
  > {
    return this.databaseService.isEnabled()
      ? await this.postgresPlatformStore.createReference(type, payload)
      : this.memoryPlatformStore.createReference(type, payload);
  }

  async updateReference(
    type: ReferenceEntityType,
    id: string,
    payload: UpsertReferencePayload,
  ): Promise<
    | TobaccoReference
    | HookahReference
    | BowlReference
    | KalaudReference
    | CharcoalReference
  > {
    return this.databaseService.isEnabled()
      ? await this.postgresPlatformStore.updateReference(type, id, payload)
      : this.memoryPlatformStore.updateReference(type, id, payload);
  }

  async listOrdersForUser(currentUser: AppUser): Promise<OrderView[]> {
    return this.databaseService.isEnabled()
      ? await this.postgresPlatformStore.listOrdersForUser(currentUser)
      : this.memoryPlatformStore.listOrdersForUser(currentUser);
  }

  async getOrderById(
    orderId: string,
    currentUser: AppUser,
  ): Promise<OrderView> {
    return this.databaseService.isEnabled()
      ? await this.postgresPlatformStore.getOrderById(orderId, currentUser)
      : this.memoryPlatformStore.getOrderById(orderId, currentUser);
  }

  async createOrder(
    clientUserId: string,
    input: {
      tableLabel: string;
      description: string;
      requestedTobaccoIds: string[];
    },
  ): Promise<OrderView> {
    return this.databaseService.isEnabled()
      ? await this.postgresPlatformStore.createOrder(clientUserId, input)
      : this.memoryPlatformStore.createOrder(clientUserId, input);
  }

  async approveParticipantTable(
    orderId: string,
    clientUserId: string,
    actorUserId: string,
  ): Promise<OrderView> {
    return this.databaseService.isEnabled()
      ? await this.postgresPlatformStore.approveParticipantTable(
          orderId,
          clientUserId,
          actorUserId,
        )
      : this.memoryPlatformStore.approveParticipantTable(
          orderId,
          clientUserId,
          actorUserId,
        );
  }

  async startOrder(orderId: string, actorUserId: string): Promise<OrderView> {
    return this.databaseService.isEnabled()
      ? await this.postgresPlatformStore.startOrder(orderId, actorUserId)
      : this.memoryPlatformStore.startOrder(orderId, actorUserId);
  }

  async fulfillOrder(
    orderId: string,
    actorUserId: string,
    input: { actualTobaccoIds: string[]; packingComment: string },
  ): Promise<OrderView> {
    return this.databaseService.isEnabled()
      ? await this.postgresPlatformStore.fulfillOrder(
          orderId,
          actorUserId,
          input,
        )
      : this.memoryPlatformStore.fulfillOrder(orderId, actorUserId, input);
  }

  async submitOrderFeedback(
    orderId: string,
    actor: AppUser,
    input: { ratingScore: number; ratingReview?: string },
  ): Promise<OrderView> {
    return this.databaseService.isEnabled()
      ? await this.postgresPlatformStore.submitOrderFeedback(
          orderId,
          actor,
          input,
        )
      : this.memoryPlatformStore.submitOrderFeedback(orderId, actor, input);
  }

  async exportResource(
    resource: 'users' | 'orders' | 'backup' | ReferenceEntityType,
  ): Promise<unknown> {
    return this.databaseService.isEnabled()
      ? await this.postgresPlatformStore.exportResource(resource)
      : undefined;
  }

  async importResource(
    resource: 'users' | 'orders' | 'backup' | ReferenceEntityType,
    payload: unknown,
  ): Promise<{ importedCount: number }> {
    return this.databaseService.isEnabled()
      ? await this.postgresPlatformStore.importResource(resource, payload)
      : { importedCount: 0 };
  }

  async exportBackup(): Promise<unknown> {
    return this.databaseService.isEnabled()
      ? await this.postgresPlatformStore.exportBackup()
      : {
          users: [],
          references: this.memoryPlatformStore.getReferencesSnapshot(),
          orders: this.memoryPlatformStore.listOrdersForUser({
            id: 'memory-admin',
            login: 'admin',
            role: UserRole.Admin,
            email: undefined,
            telegramUsername: undefined,
            isApproved: true,
            approvedAt: undefined,
            approvedBy: undefined,
            createdAt: new Date(0).toISOString(),
            updatedAt: new Date(0).toISOString(),
          }),
        };
  }
}
