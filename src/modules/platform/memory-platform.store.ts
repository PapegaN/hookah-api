import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type {
  AppUser,
  BlendComponentInput,
  BowlReference,
  CharcoalReference,
  ElectricHeadReference,
  HookahReference,
  KalaudReference,
  OrderBlendComponentView,
  OrderFeedbackRecord,
  OrderFeedbackView,
  OrderParticipantRecord,
  OrderRecord,
  OrderSetupInput,
  OrderSetupView,
  OrderTimelineEntryRecord,
  OrderView,
  ReferencesSnapshot,
  StoredUser,
  TobaccoTagReference,
  TobaccoReference,
  UpsertReferencePayload,
} from './platform.models';
import {
  HeatingSystemType,
  OrderStatus,
  OrderTimelineEventType,
  PackingStyle,
  ReferenceEntityType,
  TableApprovalStatus,
  UserRole,
} from './platform.models';

interface CreateUserInput {
  login: string;
  passwordHash: string;
  role: UserRole;
  email: string | undefined;
  telegramUsername: string | undefined;
  isApproved: boolean;
  approvedByUserId: string | undefined;
}

@Injectable()
export class MemoryPlatformStore {
  private readonly users: StoredUser[] = [];
  private readonly tobaccos: TobaccoReference[] = [];
  private readonly tobaccoTags: TobaccoTagReference[] = [];
  private readonly hookahs: HookahReference[] = [];
  private readonly bowls: BowlReference[] = [];
  private readonly kalauds: KalaudReference[] = [];
  private readonly charcoals: CharcoalReference[] = [];
  private readonly electricHeads: ElectricHeadReference[] = [];
  private readonly orders: OrderRecord[] = [];

  constructor() {
    this.seedReferences();
  }

  seedDemoUsers(hashes: {
    admin: string;
    master: string;
    client: string;
  }): void {
    if (this.users.length > 0) {
      return;
    }

    const admin = this.createUserRecord({
      login: 'admin',
      passwordHash: hashes.admin,
      role: UserRole.Admin,
      email: 'admin@hookah.local',
      telegramUsername: 'hookah_admin',
      isApproved: true,
      approvedByUserId: undefined,
    });
    this.createUserRecord({
      login: 'master',
      passwordHash: hashes.master,
      role: UserRole.HookahMaster,
      email: 'master@hookah.local',
      telegramUsername: 'hookah_master',
      isApproved: true,
      approvedByUserId: admin.id,
    });
    const client = this.createUserRecord({
      login: 'client',
      passwordHash: hashes.client,
      role: UserRole.Client,
      email: 'client@hookah.local',
      telegramUsername: 'hookah_client',
      isApproved: true,
      approvedByUserId: admin.id,
    });

    const ts = new Date().toISOString();
    this.orders.push({
      id: randomUUID(),
      tableLabel: 'РЎС‚РѕР» 3',
      status: OrderStatus.New,
      createdAt: ts,
      updatedAt: ts,
      deliveredAt: undefined,
      feedbackAt: undefined,
      acceptedByUserId: undefined,
      requestedSetup: this.resolveSetupView({
        heatingSystemType: HeatingSystemType.Coal,
        packingStyle: PackingStyle.Kompot,
        customPackingStyle: undefined,
        hookahId: this.hookahs[0]?.id,
        bowlId: this.bowls[0]?.id,
        kalaudId: this.kalauds[0]?.id,
        charcoalId: this.charcoals[0]?.id,
        electricHeadId: undefined,
        charcoalCount: 3,
        warmupMode: 'with_cap',
        warmupDurationMinutes: 6,
      }),
      actualBlend: undefined,
      actualSetup: undefined,
      packingComment: undefined,
      participants: [
        {
          clientUserId: client.id,
          description:
            'РҐРѕС‡Сѓ СЏРіРѕРґРЅС‹Р№ РјРёРєСЃ СЃ С…РѕР»РѕРґРєРѕРј Рё РјСЏРіРєРѕР№ РєСЂРµРїРѕСЃС‚СЊСЋ.',
          requestedBlend: [
            { tobaccoId: this.tobaccos[1]!.id, percentage: 70 },
            { tobaccoId: this.tobaccos[2]!.id, percentage: 30 },
          ],
          wantsCooling: true,
          wantsMint: false,
          wantsSpicy: false,
          joinedAt: ts,
          tableApprovalStatus: TableApprovalStatus.Pending,
          tableApprovedAt: undefined,
          tableApprovedByUserId: undefined,
          feedback: undefined,
        },
      ],
      timeline: [
        this.createTimelineEntry({
          type: OrderTimelineEventType.Created,
          status: OrderStatus.New,
          occurredAt: ts,
          actorUserId: client.id,
          note: 'РљР»РёРµРЅС‚ СЃРѕР·РґР°Р» Р·Р°РєР°Р· РґР»СЏ СЃС‚РѕР»Р° 3.',
        }),
      ],
    });
  }

  findStoredUserByLogin(login: string): StoredUser | undefined {
    return this.users.find(
      (user) => user.login.toLowerCase() === login.trim().toLowerCase(),
    );
  }

  findStoredUserById(id: string): StoredUser | undefined {
    return this.users.find((user) => user.id === id);
  }

  findPublicUserById(id: string): AppUser | undefined {
    const user = this.findStoredUserById(id);
    return user ? this.toPublicUser(user) : undefined;
  }

  listUsers(): AppUser[] {
    return this.users.map((user) => this.toPublicUser(user));
  }

  registerClient(
    input: Omit<CreateUserInput, 'role' | 'isApproved' | 'approvedByUserId'>,
  ): AppUser {
    return this.createUserRecord({
      ...input,
      role: UserRole.Client,
      isApproved: false,
      approvedByUserId: undefined,
    });
  }

  createUserByAdmin(
    actorUserId: string,
    input: Omit<CreateUserInput, 'approvedByUserId'>,
  ): AppUser {
    return this.createUserRecord({
      ...input,
      approvedByUserId: input.isApproved ? actorUserId : undefined,
    });
  }

  updateUser(
    actorUserId: string,
    userId: string,
    payload: Partial<
      Pick<
        AppUser,
        'login' | 'role' | 'email' | 'telegramUsername' | 'isApproved'
      >
    >,
  ): AppUser {
    const user = this.findStoredUserById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (payload.login !== undefined)
      user.login = this.requireString(payload.login, 'login');
    if (payload.role !== undefined) user.role = payload.role;
    if (payload.email !== undefined)
      user.email = this.normalizeOptionalValue(payload.email);
    if (payload.telegramUsername !== undefined)
      user.telegramUsername = this.normalizeOptionalValue(
        payload.telegramUsername,
      );
    if (payload.isApproved !== undefined) {
      user.isApproved = payload.isApproved;
      user.approvedAt = payload.isApproved
        ? new Date().toISOString()
        : undefined;
      user.approvedByUserId = payload.isApproved ? actorUserId : undefined;
    }
    user.updatedAt = new Date().toISOString();

    return this.toPublicUser(user);
  }

  getReferencesSnapshot(): ReferencesSnapshot {
    return {
      tobaccos: [...this.tobaccos],
      tobaccoTags: [...this.tobaccoTags],
      hookahs: [...this.hookahs],
      bowls: [...this.bowls],
      kalauds: [...this.kalauds],
      charcoals: [...this.charcoals],
      electricHeads: [...this.electricHeads],
    };
  }

  createReference(
    type: ReferenceEntityType,
    payload: UpsertReferencePayload,
  ):
    | TobaccoReference
    | TobaccoTagReference
    | HookahReference
    | BowlReference
    | KalaudReference
    | CharcoalReference
    | ElectricHeadReference {
    switch (type) {
      case ReferenceEntityType.Tobaccos:
        return this.createTobacco(payload);
      case ReferenceEntityType.TobaccoTags:
        return this.createTobaccoTag(payload);
      case ReferenceEntityType.Hookahs:
        return this.createHookah(payload);
      case ReferenceEntityType.Bowls:
        return this.createBowl(payload);
      case ReferenceEntityType.Kalauds:
        return this.createKalaud(payload);
      case ReferenceEntityType.Charcoals:
        return this.createCharcoal(payload);
      case ReferenceEntityType.ElectricHeads:
        return this.createElectricHead(payload);
      default:
        throw new BadRequestException('Unsupported reference type');
    }
  }

  updateReference(
    type: ReferenceEntityType,
    id: string,
    payload: UpsertReferencePayload,
  ):
    | TobaccoReference
    | TobaccoTagReference
    | HookahReference
    | BowlReference
    | KalaudReference
    | CharcoalReference
    | ElectricHeadReference {
    switch (type) {
      case ReferenceEntityType.Tobaccos:
        return this.updateTobacco(id, payload);
      case ReferenceEntityType.TobaccoTags:
        return this.updateTobaccoTag(id, payload);
      case ReferenceEntityType.Hookahs:
        return this.updateHookah(id, payload);
      case ReferenceEntityType.Bowls:
        return this.updateBowl(id, payload);
      case ReferenceEntityType.Kalauds:
        return this.updateKalaud(id, payload);
      case ReferenceEntityType.Charcoals:
        return this.updateCharcoal(id, payload);
      case ReferenceEntityType.ElectricHeads:
        return this.updateElectricHead(id, payload);
      default:
        throw new BadRequestException('Unsupported reference type');
    }
  }

  listOrdersForUser(currentUser: AppUser): OrderView[] {
    if (!currentUser.isApproved) {
      return [];
    }

    const visible =
      currentUser.role === UserRole.Client
        ? this.orders.filter((order) =>
            order.participants.some(
              (participant) => participant.clientUserId === currentUser.id,
            ),
          )
        : this.orders;

    return visible.map((order) => this.toOrderView(order));
  }

  getOrderById(orderId: string, currentUser: AppUser): OrderView {
    const order = this.findOrder(orderId);
    if (
      currentUser.role === UserRole.Client &&
      !order.participants.some(
        (participant) => participant.clientUserId === currentUser.id,
      )
    ) {
      throw new NotFoundException('Order not found');
    }

    return this.toOrderView(order);
  }

  createOrder(
    clientUserId: string,
    input: {
      tableLabel: string;
      description: string;
      requestedBlend: BlendComponentInput[];
      requestedSetup: OrderSetupInput;
      wantsCooling: boolean;
      wantsMint: boolean;
      wantsSpicy: boolean;
    },
  ): OrderView {
    const client = this.findStoredUserById(clientUserId);
    if (!client || !client.isApproved) {
      throw new BadRequestException('Client approval is required');
    }

    const tableLabel = this.requireString(input.tableLabel, 'tableLabel');
    const participant: OrderParticipantRecord = {
      clientUserId,
      description: this.requireString(input.description, 'description'),
      requestedBlend: this.validateBlendSelection(
        input.requestedBlend,
        'requested blend',
      ),
      wantsCooling: input.wantsCooling,
      wantsMint: input.wantsMint,
      wantsSpicy: input.wantsSpicy,
      joinedAt: new Date().toISOString(),
      tableApprovalStatus: TableApprovalStatus.Pending,
      tableApprovedAt: undefined,
      tableApprovedByUserId: undefined,
      feedback: undefined,
    };
    const existingOrder = this.orders.find(
      (order) =>
        order.tableLabel.toLowerCase() === tableLabel.toLowerCase() &&
        (order.status === OrderStatus.New ||
          order.status === OrderStatus.InProgress),
    );

    if (existingOrder) {
      existingOrder.participants.push(participant);
      existingOrder.updatedAt = new Date().toISOString();
      return this.toOrderView(existingOrder);
    }

    const timestamp = new Date().toISOString();
    const order: OrderRecord = {
      id: randomUUID(),
      tableLabel,
      status: OrderStatus.New,
      createdAt: timestamp,
      updatedAt: timestamp,
      deliveredAt: undefined,
      feedbackAt: undefined,
      acceptedByUserId: undefined,
      requestedSetup: this.resolveSetupView(input.requestedSetup),
      actualBlend: undefined,
      actualSetup: undefined,
      packingComment: undefined,
      participants: [participant],
      timeline: [
        this.createTimelineEntry({
          type: OrderTimelineEventType.Created,
          status: OrderStatus.New,
          occurredAt: timestamp,
          actorUserId: clientUserId,
          note: `${client.login} СЃРѕР·РґР°Р» Р·Р°РєР°Р· РґР»СЏ СЃС‚РѕР»Р° ${tableLabel}.`,
        }),
      ],
    };
    this.orders.unshift(order);
    return this.toOrderView(order);
  }

  approveParticipantTable(
    orderId: string,
    clientUserId: string,
    actorUserId: string,
  ): OrderView {
    const order = this.findOrder(orderId);
    const participant = order.participants.find(
      (entry) => entry.clientUserId === clientUserId,
    );
    if (!participant) {
      throw new NotFoundException('Participant not found');
    }

    participant.tableApprovalStatus = TableApprovalStatus.Approved;
    participant.tableApprovedAt = new Date().toISOString();
    participant.tableApprovedByUserId = actorUserId;
    order.updatedAt = new Date().toISOString();
    return this.toOrderView(order);
  }

  startOrder(orderId: string, actorUserId: string): OrderView {
    const order = this.findOrder(orderId);
    order.status = OrderStatus.InProgress;
    order.acceptedByUserId = actorUserId;
    order.updatedAt = new Date().toISOString();
    return this.toOrderView(order);
  }

  fulfillOrder(
    orderId: string,
    actorUserId: string,
    input: {
      actualBlend: BlendComponentInput[];
      actualSetup: OrderSetupInput;
      packingComment: string;
    },
  ): OrderView {
    const order = this.findOrder(orderId);
    order.status = OrderStatus.ReadyForFeedback;
    order.acceptedByUserId = actorUserId;
    order.actualBlend = this.validateBlendSelection(
      input.actualBlend,
      'actual blend',
    );
    order.actualSetup = this.resolveSetupView(input.actualSetup);
    order.packingComment = this.normalizeOptionalValue(input.packingComment);
    order.deliveredAt = new Date().toISOString();
    order.updatedAt = order.deliveredAt;
    return this.toOrderView(order);
  }

  submitOrderFeedback(
    orderId: string,
    actor: AppUser,
    input: { ratingScore: number; ratingReview?: string },
  ): OrderView {
    const order = this.findOrder(orderId);
    const participant = order.participants.find(
      (entry) => entry.clientUserId === actor.id,
    );
    if (!participant) {
      throw new BadRequestException(
        'Client can leave feedback only for joined table order',
      );
    }

    participant.feedback = {
      clientUserId: actor.id,
      ratingScore: this.requireScaleValue(input.ratingScore, 'ratingScore'),
      ratingReview: this.normalizeOptionalValue(input.ratingReview),
      submittedAt: new Date().toISOString(),
    };
    order.feedbackAt = participant.feedback.submittedAt;
    order.status = order.participants.every((entry) => entry.feedback)
      ? OrderStatus.Rated
      : OrderStatus.ReadyForFeedback;
    order.updatedAt = order.feedbackAt;
    return this.toOrderView(order);
  }

  async exportResource(
    resource: 'users' | 'orders' | 'backup' | ReferenceEntityType,
  ): Promise<unknown> {
    if (resource === 'users') return this.users;
    if (resource === 'orders')
      return this.listOrdersForUser(this.systemAdmin());
    if (resource === 'backup') return this.exportBackup();
    switch (resource) {
      case ReferenceEntityType.Tobaccos:
        return this.getReferencesSnapshot().tobaccos;
      case ReferenceEntityType.TobaccoTags:
        return this.getReferencesSnapshot().tobaccoTags;
      case ReferenceEntityType.Hookahs:
        return this.getReferencesSnapshot().hookahs;
      case ReferenceEntityType.Bowls:
        return this.getReferencesSnapshot().bowls;
      case ReferenceEntityType.Kalauds:
        return this.getReferencesSnapshot().kalauds;
      case ReferenceEntityType.Charcoals:
        return this.getReferencesSnapshot().charcoals;
      case ReferenceEntityType.ElectricHeads:
        return this.getReferencesSnapshot().electricHeads;
      default:
        throw new BadRequestException('Unsupported export resource');
    }
  }

  importResource(
    resource: 'users' | 'orders' | 'backup' | ReferenceEntityType,
    payload: unknown,
  ): Promise<{ importedCount: number }> {
    if (resource !== 'backup') {
      return Promise.resolve({ importedCount: 0 });
    }

    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException('Backup payload must be an object');
    }

    const envelope = payload as {
      schemaVersion?: string;
      checksumSha256?: string;
      payload?: unknown;
    };
    if (envelope.schemaVersion !== 'hookah-backup.v2' || !envelope.payload) {
      throw new BadRequestException('Unsupported backup schema version');
    }

    const checksum = createHash('sha256')
      .update(JSON.stringify(envelope.payload))
      .digest('hex');
    if (checksum !== envelope.checksumSha256) {
      throw new BadRequestException('Backup checksum validation failed');
    }

    return Promise.resolve({ importedCount: 0 });
  }

  exportBackup(): Promise<unknown> {
    const payload = {
      users: [...this.users],
      references: this.getReferencesSnapshot(),
      orders: this.listOrdersForUser(this.systemAdmin()),
    };
    return Promise.resolve({
      schemaVersion: 'hookah-backup.v2',
      exportedAt: new Date().toISOString(),
      resource: 'backup',
      checksumSha256: createHash('sha256')
        .update(JSON.stringify(payload))
        .digest('hex'),
      payload,
    });
  }

  private systemAdmin(): AppUser {
    return {
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
    };
  }

  private createUserRecord(input: CreateUserInput): AppUser {
    const timestamp = new Date().toISOString();
    const user: StoredUser = {
      id: randomUUID(),
      login: this.requireString(input.login, 'login'),
      passwordHash: input.passwordHash,
      role: input.role,
      email: this.normalizeOptionalValue(input.email),
      telegramUsername: this.normalizeOptionalValue(input.telegramUsername),
      isApproved: input.isApproved,
      approvedAt: input.isApproved ? timestamp : undefined,
      approvedByUserId: input.approvedByUserId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.users.push(user);
    return this.toPublicUser(user);
  }

  private createTobacco(payload: UpsertReferencePayload): TobaccoReference {
    const item: TobaccoReference = {
      id: randomUUID(),
      brand: this.requireString(payload.brand, 'brand'),
      line: this.requireString(payload.line, 'line'),
      flavorName: this.requireString(payload.flavorName, 'flavorName'),
      markingCode: this.normalizeOptionalValue(payload.markingCode),
      lineStrengthLevel: this.requireScaleValue(
        payload.lineStrengthLevel,
        'lineStrengthLevel',
      ),
      estimatedStrengthLevel: this.requireScaleValue(
        payload.estimatedStrengthLevel,
        'estimatedStrengthLevel',
      ),
      brightnessLevel: this.requireScaleValue(
        payload.brightnessLevel,
        'brightnessLevel',
      ),
      flavorDescription: this.requireString(
        payload.flavorDescription,
        'flavorDescription',
      ),
      flavorTags: this.resolveTobaccoTags(payload.flavorTags),
      inStock: payload.inStock ?? true,
      isActive: payload.isActive ?? true,
    };
    this.tobaccos.unshift(item);
    return item;
  }

  private updateTobacco(
    id: string,
    payload: UpsertReferencePayload,
  ): TobaccoReference {
    const item = this.findReferenceById(this.tobaccos, id, 'Tobacco');
    if (payload.brand !== undefined)
      item.brand = this.requireString(payload.brand, 'brand');
    if (payload.line !== undefined)
      item.line = this.requireString(payload.line, 'line');
    if (payload.flavorName !== undefined)
      item.flavorName = this.requireString(payload.flavorName, 'flavorName');
    if (payload.markingCode !== undefined)
      item.markingCode = this.normalizeOptionalValue(payload.markingCode);
    if (payload.lineStrengthLevel !== undefined)
      item.lineStrengthLevel = this.requireScaleValue(
        payload.lineStrengthLevel,
        'lineStrengthLevel',
      );
    if (payload.estimatedStrengthLevel !== undefined)
      item.estimatedStrengthLevel = this.requireScaleValue(
        payload.estimatedStrengthLevel,
        'estimatedStrengthLevel',
      );
    if (payload.brightnessLevel !== undefined)
      item.brightnessLevel = this.requireScaleValue(
        payload.brightnessLevel,
        'brightnessLevel',
      );
    if (payload.flavorDescription !== undefined)
      item.flavorDescription = this.requireString(
        payload.flavorDescription,
        'flavorDescription',
      );
    if (payload.flavorTags !== undefined)
      item.flavorTags = this.resolveTobaccoTags(payload.flavorTags);
    if (payload.inStock !== undefined) item.inStock = payload.inStock;
    if (payload.isActive !== undefined) item.isActive = payload.isActive;
    return item;
  }

  private createTobaccoTag(
    payload: UpsertReferencePayload,
  ): TobaccoTagReference {
    const item: TobaccoTagReference = {
      id: randomUUID(),
      name: this.requireString(payload.name, 'name'),
      isActive: payload.isActive ?? true,
    };
    this.tobaccoTags.unshift(item);
    return item;
  }

  private updateTobaccoTag(
    id: string,
    payload: UpsertReferencePayload,
  ): TobaccoTagReference {
    const item = this.findReferenceById(this.tobaccoTags, id, 'Tobacco tag');
    if (payload.name !== undefined)
      item.name = this.requireString(payload.name, 'name');
    if (payload.isActive !== undefined) item.isActive = payload.isActive;
    return item;
  }

  private createHookah(payload: UpsertReferencePayload): HookahReference {
    const item: HookahReference = {
      id: randomUUID(),
      manufacturer: this.requireString(payload.manufacturer, 'manufacturer'),
      name: this.requireString(payload.name, 'name'),
      innerDiameterMm: this.requirePositiveNumber(
        payload.innerDiameterMm,
        'innerDiameterMm',
      ),
      hasDiffuser: payload.hasDiffuser ?? false,
      isActive: payload.isActive ?? true,
    };
    this.hookahs.unshift(item);
    return item;
  }

  private updateHookah(
    id: string,
    payload: UpsertReferencePayload,
  ): HookahReference {
    const item = this.findReferenceById(this.hookahs, id, 'Hookah');
    if (payload.manufacturer !== undefined)
      item.manufacturer = this.requireString(
        payload.manufacturer,
        'manufacturer',
      );
    if (payload.name !== undefined)
      item.name = this.requireString(payload.name, 'name');
    if (payload.innerDiameterMm !== undefined)
      item.innerDiameterMm = this.requirePositiveNumber(
        payload.innerDiameterMm,
        'innerDiameterMm',
      );
    if (payload.hasDiffuser !== undefined)
      item.hasDiffuser = payload.hasDiffuser;
    if (payload.isActive !== undefined) item.isActive = payload.isActive;
    return item;
  }

  private createBowl(payload: UpsertReferencePayload): BowlReference {
    const item: BowlReference = {
      id: randomUUID(),
      manufacturer: this.requireString(payload.manufacturer, 'manufacturer'),
      name: this.requireString(payload.name, 'name'),
      bowlType: this.requireBowlType(payload.bowlType),
      material: this.normalizeOptionalValue(payload.material),
      capacityBucket: this.requireCapacityBucket(payload.capacityBucket),
      isActive: payload.isActive ?? true,
    };
    this.bowls.unshift(item);
    return item;
  }

  private updateBowl(
    id: string,
    payload: UpsertReferencePayload,
  ): BowlReference {
    const item = this.findReferenceById(this.bowls, id, 'Bowl');
    if (payload.manufacturer !== undefined)
      item.manufacturer = this.requireString(
        payload.manufacturer,
        'manufacturer',
      );
    if (payload.name !== undefined)
      item.name = this.requireString(payload.name, 'name');
    if (payload.bowlType !== undefined)
      item.bowlType = this.requireBowlType(payload.bowlType);
    if (payload.material !== undefined)
      item.material = this.normalizeOptionalValue(payload.material);
    if (payload.capacityBucket !== undefined)
      item.capacityBucket = this.requireCapacityBucket(payload.capacityBucket);
    if (payload.isActive !== undefined) item.isActive = payload.isActive;
    return item;
  }

  private createKalaud(payload: UpsertReferencePayload): KalaudReference {
    const item: KalaudReference = {
      id: randomUUID(),
      manufacturer: this.requireString(payload.manufacturer, 'manufacturer'),
      name: this.requireString(payload.name, 'name'),
      material: this.normalizeOptionalValue(payload.material),
      color: this.normalizeOptionalValue(payload.color),
      isActive: payload.isActive ?? true,
    };
    this.kalauds.unshift(item);
    return item;
  }

  private updateKalaud(
    id: string,
    payload: UpsertReferencePayload,
  ): KalaudReference {
    const item = this.findReferenceById(this.kalauds, id, 'Kalaud');
    if (payload.manufacturer !== undefined)
      item.manufacturer = this.requireString(
        payload.manufacturer,
        'manufacturer',
      );
    if (payload.name !== undefined)
      item.name = this.requireString(payload.name, 'name');
    if (payload.material !== undefined)
      item.material = this.normalizeOptionalValue(payload.material);
    if (payload.color !== undefined)
      item.color = this.normalizeOptionalValue(payload.color);
    if (payload.isActive !== undefined) item.isActive = payload.isActive;
    return item;
  }

  private createCharcoal(payload: UpsertReferencePayload): CharcoalReference {
    const item: CharcoalReference = {
      id: randomUUID(),
      manufacturer: this.requireString(payload.manufacturer, 'manufacturer'),
      name: this.requireString(payload.name, 'name'),
      sizeLabel: this.requireString(payload.sizeLabel, 'sizeLabel'),
      isActive: payload.isActive ?? true,
    };
    this.charcoals.unshift(item);
    return item;
  }

  private updateCharcoal(
    id: string,
    payload: UpsertReferencePayload,
  ): CharcoalReference {
    const item = this.findReferenceById(this.charcoals, id, 'Charcoal');
    if (payload.manufacturer !== undefined)
      item.manufacturer = this.requireString(
        payload.manufacturer,
        'manufacturer',
      );
    if (payload.name !== undefined)
      item.name = this.requireString(payload.name, 'name');
    if (payload.sizeLabel !== undefined)
      item.sizeLabel = this.requireString(payload.sizeLabel, 'sizeLabel');
    if (payload.isActive !== undefined) item.isActive = payload.isActive;
    return item;
  }

  private createElectricHead(
    payload: UpsertReferencePayload,
  ): ElectricHeadReference {
    const item: ElectricHeadReference = {
      id: randomUUID(),
      manufacturer: this.requireString(payload.manufacturer, 'manufacturer'),
      name: this.requireString(payload.name, 'name'),
      isActive: payload.isActive ?? true,
    };
    this.electricHeads.unshift(item);
    return item;
  }

  private updateElectricHead(
    id: string,
    payload: UpsertReferencePayload,
  ): ElectricHeadReference {
    const item = this.findReferenceById(
      this.electricHeads,
      id,
      'Electric head',
    );
    if (payload.manufacturer !== undefined)
      item.manufacturer = this.requireString(
        payload.manufacturer,
        'manufacturer',
      );
    if (payload.name !== undefined)
      item.name = this.requireString(payload.name, 'name');
    if (payload.isActive !== undefined) item.isActive = payload.isActive;
    return item;
  }

  private findReferenceById<T extends { id: string }>(
    collection: T[],
    id: string,
    label: string,
  ): T {
    const item = collection.find((entry) => entry.id === id);
    if (!item) throw new NotFoundException(`${label} not found`);
    return item;
  }

  private findOrder(orderId: string): OrderRecord {
    const order = this.orders.find((entry) => entry.id === orderId);
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  private toPublicUser(user: StoredUser): AppUser {
    return {
      id: user.id,
      login: user.login,
      role: user.role,
      email: user.email,
      telegramUsername: user.telegramUsername,
      isApproved: user.isApproved,
      approvedAt: user.approvedAt,
      approvedBy: user.approvedByUserId
        ? {
            id: user.approvedByUserId,
            login:
              this.findStoredUserById(user.approvedByUserId)?.login ??
              'unknown',
          }
        : undefined,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private toOrderView(order: OrderRecord): OrderView {
    const participants = order.participants.map((participant) => {
      const client = this.findPublicUserById(participant.clientUserId);
      if (!client) throw new NotFoundException('Client not found');
      const requestedBlend = this.resolveBlend(participant.requestedBlend);
      return {
        client,
        description: participant.description,
        joinedAt: participant.joinedAt,
        requestedBlend,
        requestedTobaccos: requestedBlend.map((entry) => entry.tobacco),
        wantsCooling: participant.wantsCooling,
        wantsMint: participant.wantsMint,
        wantsSpicy: participant.wantsSpicy,
        tableApprovalStatus: participant.tableApprovalStatus,
        tableApprovedAt: participant.tableApprovedAt,
        tableApprovedBy: participant.tableApprovedByUserId
          ? {
              id: participant.tableApprovedByUserId,
              login:
                this.findStoredUserById(participant.tableApprovedByUserId)
                  ?.login ?? 'unknown',
            }
          : undefined,
        feedback: participant.feedback
          ? this.toFeedbackView(participant.feedback)
          : undefined,
      };
    });
    const requestedBlend = [
      ...new Map(
        participants
          .flatMap((participant) => participant.requestedBlend)
          .map((entry) => [entry.tobacco.id, entry]),
      ).values(),
    ];
    const actualBlend = this.resolveBlend(order.actualBlend ?? []);
    return {
      id: order.id,
      tableLabel: order.tableLabel,
      status: order.status,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      deliveredAt: order.deliveredAt,
      feedbackAt: order.feedbackAt,
      acceptedBy: order.acceptedByUserId
        ? this.findPublicUserById(order.acceptedByUserId)
        : undefined,
      requestedSetup: order.requestedSetup,
      actualSetup: order.actualSetup,
      participants,
      requestedBlend,
      requestedTobaccos: requestedBlend.map((entry) => entry.tobacco),
      actualBlend,
      actualTobaccos: actualBlend.map((entry) => entry.tobacco),
      packingComment: order.packingComment,
      feedbacks: participants
        .map((participant) => participant.feedback)
        .filter((entry): entry is OrderFeedbackView => Boolean(entry)),
      timeline: order.timeline.map((entry) => ({
        id: entry.id,
        type: entry.type,
        status: entry.status,
        occurredAt: entry.occurredAt,
        actor: entry.actorUserId
          ? this.findPublicUserById(entry.actorUserId)
          : undefined,
        note: entry.note,
      })),
    };
  }

  private resolveBlend(
    blend: BlendComponentInput[],
  ): OrderBlendComponentView[] {
    return blend.map((entry) => ({
      tobacco: this.findReferenceById(
        this.tobaccos,
        entry.tobaccoId,
        'Tobacco',
      ),
      percentage: entry.percentage,
    }));
  }

  private toFeedbackView(feedback: OrderFeedbackRecord): OrderFeedbackView {
    const client = this.findPublicUserById(feedback.clientUserId);
    if (!client) throw new NotFoundException('Client for feedback not found');
    return {
      client,
      ratingScore: feedback.ratingScore,
      ratingReview: feedback.ratingReview,
      submittedAt: feedback.submittedAt,
    };
  }

  private createTimelineEntry(input: {
    type: OrderTimelineEventType;
    status: OrderStatus;
    occurredAt: string;
    actorUserId: string | undefined;
    note: string;
  }): OrderTimelineEntryRecord {
    return {
      id: randomUUID(),
      type: input.type,
      status: input.status,
      occurredAt: input.occurredAt,
      actorUserId: input.actorUserId,
      note: input.note,
    };
  }

  private validateBlendSelection(
    blend: BlendComponentInput[],
    label: string,
  ): BlendComponentInput[] {
    if (!Array.isArray(blend) || blend.length === 0 || blend.length > 3)
      throw new BadRequestException(
        `${label} should contain from 1 to 3 tobaccos`,
      );
    const total = blend.reduce((sum, entry) => sum + entry.percentage, 0);
    if (Math.abs(total - 100) > 0.001)
      throw new BadRequestException(`${label} should sum to 100 percent`);
    return blend.map((entry) => ({
      tobaccoId: this.findReferenceById(
        this.tobaccos,
        entry.tobaccoId,
        'Tobacco',
      ).id,
      percentage: Number(entry.percentage.toFixed(2)),
    }));
  }

  private resolveSetupView(input: OrderSetupInput): OrderSetupView {
    return input.heatingSystemType === HeatingSystemType.Electric
      ? {
          heatingSystemType: HeatingSystemType.Electric,
          packingStyle: input.packingStyle,
          customPackingStyle: this.normalizeOptionalValue(
            input.customPackingStyle,
          ),
          hookah: input.hookahId
            ? this.findReferenceById(this.hookahs, input.hookahId, 'Hookah')
            : undefined,
          bowl: undefined,
          kalaud: undefined,
          charcoal: undefined,
          electricHead: input.electricHeadId
            ? this.findReferenceById(
                this.electricHeads,
                input.electricHeadId,
                'Electric head',
              )
            : undefined,
          charcoalCount: undefined,
          warmupMode: undefined,
          warmupDurationMinutes: undefined,
        }
      : {
          heatingSystemType: HeatingSystemType.Coal,
          packingStyle: input.packingStyle,
          customPackingStyle: this.normalizeOptionalValue(
            input.customPackingStyle,
          ),
          hookah: input.hookahId
            ? this.findReferenceById(this.hookahs, input.hookahId, 'Hookah')
            : undefined,
          bowl: input.bowlId
            ? this.findReferenceById(this.bowls, input.bowlId, 'Bowl')
            : undefined,
          kalaud: input.kalaudId
            ? this.findReferenceById(this.kalauds, input.kalaudId, 'Kalaud')
            : undefined,
          charcoal: input.charcoalId
            ? this.findReferenceById(
                this.charcoals,
                input.charcoalId,
                'Charcoal',
              )
            : undefined,
          electricHead: undefined,
          charcoalCount: input.charcoalCount,
          warmupMode: input.warmupMode,
          warmupDurationMinutes: input.warmupDurationMinutes,
        };
  }

  private requireString(
    value: string | number | boolean | undefined,
    label: string,
  ): string {
    if (typeof value !== 'string' || value.trim().length === 0)
      throw new BadRequestException(`${label} must be a string`);
    return value.trim();
  }
  private requireScaleValue(
    value: string | number | boolean | undefined,
    label: string,
  ): number {
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < 1 ||
      value > 5
    )
      throw new BadRequestException(`${label} must be between 1 and 5`);
    return value;
  }
  private requirePositiveNumber(
    value: string | number | boolean | undefined,
    label: string,
  ): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
      throw new BadRequestException(`${label} must be a positive number`);
    return value;
  }
  private requireBowlType(
    value: UpsertReferencePayload['bowlType'],
  ): BowlReference['bowlType'] {
    if (
      value !== 'phunnel' &&
      value !== 'killer' &&
      value !== 'turka' &&
      value !== 'elian'
    )
      throw new BadRequestException('bowlType is invalid');
    return value;
  }
  private requireCapacityBucket(
    value: UpsertReferencePayload['capacityBucket'],
  ): BowlReference['capacityBucket'] {
    if (
      value !== 'bucket' &&
      value !== 'large' &&
      value !== 'medium' &&
      value !== 'small' &&
      value !== 'very_small'
    )
      throw new BadRequestException('capacityBucket is invalid');
    return value;
  }
  private normalizeOptionalValue(
    value: string | number | boolean | undefined,
  ): string | undefined {
    if (typeof value !== 'string') return undefined;
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  private resolveTobaccoTags(
    input: string[] | string | undefined,
  ): TobaccoTagReference[] {
    const names = Array.isArray(input)
      ? input
      : typeof input === 'string'
        ? input
            .split(',')
            .map((item) => item.trim())
            .filter((item) => item.length > 0)
        : [];

    return this.tobaccoTags.filter((tag) => names.includes(tag.name));
  }

  private seedReferences(): void {
    this.tobaccoTags.push({
      id: randomUUID(),
      name: 'РњСЏС‚РЅС‹Р№',
      isActive: true,
    });
    this.tobaccoTags.push({
      id: randomUUID(),
      name: 'РЇРіРѕРґРЅС‹Р№',
      isActive: true,
    });
    this.tobaccoTags.push({
      id: randomUUID(),
      name: 'Р¤СЂСѓРєС‚РѕРІС‹Р№',
      isActive: true,
    });

    this.tobaccos.push({
      id: randomUUID(),
      brand: 'Darkside',
      line: 'Core',
      flavorName: 'Bounty Hunter',
      markingCode: '0104607001774080215DBOUNTY00191MEM000001',
      lineStrengthLevel: 4,
      estimatedStrengthLevel: 4,
      brightnessLevel: 3,
      flavorDescription:
        'РЁРѕРєРѕР»Р°РґРЅРѕ-РєРѕРєРѕСЃРѕРІС‹Р№ РґРµСЃРµСЂС‚РЅС‹Р№ РІРєСѓСЃ.',
      flavorTags: [],
      inStock: true,
      isActive: true,
    });
    this.tobaccos.push({
      id: randomUUID(),
      brand: 'Must Have',
      line: 'Classic',
      flavorName: 'Pinkman',
      markingCode: '0104607001774080215MPINKMAN0191MEM000002',
      lineStrengthLevel: 3,
      estimatedStrengthLevel: 3,
      brightnessLevel: 5,
      flavorDescription:
        'РЇСЂРєРёР№ СЏРіРѕРґРЅС‹Р№ РјРёРєСЃ СЃ С†РёС‚СЂСѓСЃРѕРІРѕР№ СЃРІРµР¶РµСЃС‚СЊСЋ.',
      flavorTags: this.tobaccoTags.filter((tag) =>
        ['РЇРіРѕРґРЅС‹Р№', 'Р¤СЂСѓРєС‚РѕРІС‹Р№'].includes(tag.name),
      ),
      inStock: true,
      isActive: true,
    });
    this.tobaccos.push({
      id: randomUUID(),
      brand: 'Black Burn',
      line: 'Base',
      flavorName: 'Mint Shock',
      markingCode: '0104607001774080215BMINTSHK0391MEM000003',
      lineStrengthLevel: 4,
      estimatedStrengthLevel: 4,
      brightnessLevel: 4,
      flavorDescription:
        'РњРѕС‰РЅР°СЏ РјСЏС‚Р° СЃ РІС‹СЂР°Р¶РµРЅРЅС‹Рј С…РѕР»РѕРґРєРѕРј.',
      flavorTags: this.tobaccoTags.filter((tag) => tag.name === 'РњСЏС‚РЅС‹Р№'),
      inStock: true,
      isActive: true,
    });
    this.hookahs.push({
      id: randomUUID(),
      manufacturer: 'Alpha Hookah',
      name: 'Model X',
      innerDiameterMm: 13,
      hasDiffuser: true,
      isActive: true,
    });
    this.bowls.push({
      id: randomUUID(),
      manufacturer: 'Werkbund',
      name: 'Turkish Killer',
      bowlType: 'killer',
      material: 'Р“Р»РёРЅР°',
      capacityBucket: 'medium',
      isActive: true,
    });
    this.kalauds.push({
      id: randomUUID(),
      manufacturer: 'Na Grani',
      name: 'HMD Pro',
      material: 'РђР»СЋРјРёРЅРёР№',
      color: 'Р§С‘СЂРЅС‹Р№',
      isActive: true,
    });
    this.charcoals.push({
      id: randomUUID(),
      manufacturer: 'CocoUrth',
      name: 'Cube',
      sizeLabel: '25 РјРј',
      isActive: true,
    });
    this.electricHeads.push({
      id: randomUUID(),
      manufacturer: 'Alpha Hookah',
      name: 'Hookah Pro',
      isActive: true,
    });
  }
}
