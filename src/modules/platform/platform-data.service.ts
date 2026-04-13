import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  AppUser,
  BowlReference,
  CharcoalReference,
  HookahReference,
  KalaudReference,
  OrderRecord,
  OrderView,
  ReferencesSnapshot,
  StoredUser,
  TobaccoReference,
  UpsertReferencePayload,
} from './platform.models';
import { OrderStatus, ReferenceEntityType, UserRole } from './platform.models';

interface CreateUserInput {
  login: string;
  passwordHash: string;
  role: UserRole;
  email: string | undefined;
  telegramUsername: string | undefined;
}

@Injectable()
export class PlatformDataService {
  private readonly users: StoredUser[] = [];
  private readonly tobaccos: TobaccoReference[] = [];
  private readonly hookahs: HookahReference[] = [];
  private readonly bowls: BowlReference[] = [];
  private readonly kalauds: KalaudReference[] = [];
  private readonly charcoals: CharcoalReference[] = [];
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

    const admin = this.createUser({
      login: 'admin',
      passwordHash: hashes.admin,
      role: UserRole.Admin,
      email: 'admin@hookah.local',
      telegramUsername: 'hookah_admin',
    });

    const master = this.createUser({
      login: 'master',
      passwordHash: hashes.master,
      role: UserRole.HookahMaster,
      email: 'master@hookah.local',
      telegramUsername: 'hookah_master',
    });

    const client = this.createUser({
      login: 'client',
      passwordHash: hashes.client,
      role: UserRole.Client,
      email: 'client@hookah.local',
      telegramUsername: 'hookah_client',
    });

    this.orders.push({
      id: randomUUID(),
      clientUserId: client.id,
      description:
        'Хочу мягкий свежий микс с заметной ягодной нотой и без тяжелой десертности.',
      requestedTobaccoIds: [
        this.tobaccos[0]?.id ?? '',
        this.tobaccos[2]?.id ?? '',
      ].filter((value) => value.length > 0),
      status: OrderStatus.New,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      acceptedByUserId: undefined,
      actualTobaccoIds: undefined,
      packingComment: undefined,
      deliveredAt: undefined,
      ratingScore: undefined,
      ratingReview: undefined,
      ratedAt: undefined,
    });

    if (!admin || !master) {
      throw new Error('Demo users must be initialized');
    }
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

  registerClient(input: Omit<CreateUserInput, 'role'>): AppUser {
    return this.createUser({
      ...input,
      role: UserRole.Client,
    });
  }

  updateUser(
    userId: string,
    payload: Partial<
      Pick<AppUser, 'login' | 'role' | 'email' | 'telegramUsername'>
    >,
  ): AppUser {
    const targetUser = this.findStoredUserById(userId);

    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    if (payload.login) {
      const normalizedLogin = payload.login.trim();
      const loginOwner = this.findStoredUserByLogin(normalizedLogin);

      if (loginOwner && loginOwner.id !== userId) {
        throw new BadRequestException('Login is already in use');
      }

      targetUser.login = normalizedLogin;
    }

    if (payload.role) {
      targetUser.role = payload.role;
    }

    if (payload.email !== undefined) {
      const normalizedEmail = this.normalizeOptionalValue(payload.email);

      if (
        normalizedEmail &&
        this.users.some(
          (user) =>
            user.id !== userId &&
            user.email?.toLowerCase() === normalizedEmail.toLowerCase(),
        )
      ) {
        throw new BadRequestException('Email is already in use');
      }

      targetUser.email = normalizedEmail;
    }

    if (payload.telegramUsername !== undefined) {
      const normalizedTelegram = this.normalizeOptionalValue(
        payload.telegramUsername,
      );

      if (
        normalizedTelegram &&
        this.users.some(
          (user) =>
            user.id !== userId &&
            user.telegramUsername?.toLowerCase() ===
              normalizedTelegram.toLowerCase(),
        )
      ) {
        throw new BadRequestException('Telegram username is already in use');
      }

      targetUser.telegramUsername = normalizedTelegram;
    }

    targetUser.updatedAt = new Date().toISOString();

    return this.toPublicUser(targetUser);
  }

  getReferencesSnapshot(): ReferencesSnapshot {
    return {
      tobaccos: [...this.tobaccos],
      hookahs: [...this.hookahs],
      bowls: [...this.bowls],
      kalauds: [...this.kalauds],
      charcoals: [...this.charcoals],
    };
  }

  createReference(
    type: ReferenceEntityType,
    payload: UpsertReferencePayload,
  ):
    | TobaccoReference
    | HookahReference
    | BowlReference
    | KalaudReference
    | CharcoalReference {
    switch (type) {
      case ReferenceEntityType.Tobaccos:
        return this.createTobacco(payload);
      case ReferenceEntityType.Hookahs:
        return this.createHookah(payload);
      case ReferenceEntityType.Bowls:
        return this.createBowl(payload);
      case ReferenceEntityType.Kalauds:
        return this.createKalaud(payload);
      case ReferenceEntityType.Charcoals:
        return this.createCharcoal(payload);
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
    | HookahReference
    | BowlReference
    | KalaudReference
    | CharcoalReference {
    switch (type) {
      case ReferenceEntityType.Tobaccos:
        return this.updateTobacco(id, payload);
      case ReferenceEntityType.Hookahs:
        return this.updateHookah(id, payload);
      case ReferenceEntityType.Bowls:
        return this.updateBowl(id, payload);
      case ReferenceEntityType.Kalauds:
        return this.updateKalaud(id, payload);
      case ReferenceEntityType.Charcoals:
        return this.updateCharcoal(id, payload);
      default:
        throw new BadRequestException('Unsupported reference type');
    }
  }

  listOrdersForUser(currentUser: AppUser): OrderView[] {
    const visibleOrders =
      currentUser.role === UserRole.Client
        ? this.orders.filter((order) => order.clientUserId === currentUser.id)
        : this.orders;

    return visibleOrders
      .slice()
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((order) => this.toOrderView(order));
  }

  createOrder(
    clientUserId: string,
    input: { description: string; requestedTobaccoIds: string[] },
  ): OrderView {
    const requestedTobaccoIds = this.validateTobaccoSelection(
      input.requestedTobaccoIds,
      'requested blend',
    );
    const timestamp = new Date().toISOString();

    const order: OrderRecord = {
      id: randomUUID(),
      clientUserId,
      description: input.description.trim(),
      requestedTobaccoIds,
      status: OrderStatus.New,
      createdAt: timestamp,
      updatedAt: timestamp,
      acceptedByUserId: undefined,
      actualTobaccoIds: undefined,
      packingComment: undefined,
      deliveredAt: undefined,
      ratingScore: undefined,
      ratingReview: undefined,
      ratedAt: undefined,
    };

    this.orders.unshift(order);

    return this.toOrderView(order);
  }

  startOrder(orderId: string, actorUserId: string): OrderView {
    const order = this.findOrder(orderId);

    if (order.status !== OrderStatus.New) {
      throw new BadRequestException('Only new orders can be taken into work');
    }

    order.status = OrderStatus.InProgress;
    order.acceptedByUserId = actorUserId;
    order.updatedAt = new Date().toISOString();

    return this.toOrderView(order);
  }

  fulfillOrder(
    orderId: string,
    actorUserId: string,
    input: { actualTobaccoIds: string[]; packingComment: string },
  ): OrderView {
    const order = this.findOrder(orderId);

    if (
      order.status !== OrderStatus.New &&
      order.status !== OrderStatus.InProgress
    ) {
      throw new BadRequestException(
        'Order cannot be fulfilled in current state',
      );
    }

    order.status = OrderStatus.ReadyForFeedback;
    order.acceptedByUserId = actorUserId;
    order.actualTobaccoIds = this.validateTobaccoSelection(
      input.actualTobaccoIds,
      'actual packing',
    );
    order.packingComment = input.packingComment.trim();
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

    if (order.clientUserId !== actor.id) {
      throw new BadRequestException(
        'Client can leave feedback only for own order',
      );
    }

    if (order.status !== OrderStatus.ReadyForFeedback) {
      throw new BadRequestException(
        'Feedback is available only after order delivery',
      );
    }

    order.status = OrderStatus.Rated;
    order.ratingScore = input.ratingScore;
    order.ratingReview = input.ratingReview?.trim();
    order.ratedAt = new Date().toISOString();
    order.updatedAt = order.ratedAt;

    return this.toOrderView(order);
  }

  private createUser(input: CreateUserInput): AppUser {
    const normalizedLogin = input.login.trim();

    if (this.findStoredUserByLogin(normalizedLogin)) {
      throw new BadRequestException('Login is already in use');
    }

    const normalizedEmail = this.normalizeOptionalValue(input.email);

    if (
      normalizedEmail &&
      this.users.some(
        (user) => user.email?.toLowerCase() === normalizedEmail.toLowerCase(),
      )
    ) {
      throw new BadRequestException('Email is already in use');
    }

    const normalizedTelegram = this.normalizeOptionalValue(
      input.telegramUsername,
    );

    if (
      normalizedTelegram &&
      this.users.some(
        (user) =>
          user.telegramUsername?.toLowerCase() ===
          normalizedTelegram.toLowerCase(),
      )
    ) {
      throw new BadRequestException('Telegram username is already in use');
    }

    const timestamp = new Date().toISOString();

    const storedUser: StoredUser = {
      id: randomUUID(),
      login: normalizedLogin,
      passwordHash: input.passwordHash,
      role: input.role,
      email: normalizedEmail,
      telegramUsername: normalizedTelegram,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.users.push(storedUser);

    return this.toPublicUser(storedUser);
  }

  private createTobacco(payload: UpsertReferencePayload): TobaccoReference {
    const tobacco: TobaccoReference = {
      id: randomUUID(),
      brand: this.requireString(payload.brand, 'brand'),
      line: this.requireString(payload.line, 'line'),
      flavorName: this.requireString(payload.flavorName, 'flavorName'),
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
      isActive: payload.isActive ?? true,
    };

    this.tobaccos.unshift(tobacco);

    return tobacco;
  }

  private updateTobacco(
    id: string,
    payload: UpsertReferencePayload,
  ): TobaccoReference {
    const tobacco = this.findReferenceById(this.tobaccos, id, 'Tobacco');

    if (payload.brand !== undefined) {
      tobacco.brand = this.requireString(payload.brand, 'brand');
    }

    if (payload.line !== undefined) {
      tobacco.line = this.requireString(payload.line, 'line');
    }

    if (payload.flavorName !== undefined) {
      tobacco.flavorName = this.requireString(payload.flavorName, 'flavorName');
    }

    if (payload.lineStrengthLevel !== undefined) {
      tobacco.lineStrengthLevel = this.requireScaleValue(
        payload.lineStrengthLevel,
        'lineStrengthLevel',
      );
    }

    if (payload.estimatedStrengthLevel !== undefined) {
      tobacco.estimatedStrengthLevel = this.requireScaleValue(
        payload.estimatedStrengthLevel,
        'estimatedStrengthLevel',
      );
    }

    if (payload.brightnessLevel !== undefined) {
      tobacco.brightnessLevel = this.requireScaleValue(
        payload.brightnessLevel,
        'brightnessLevel',
      );
    }

    if (payload.flavorDescription !== undefined) {
      tobacco.flavorDescription = this.requireString(
        payload.flavorDescription,
        'flavorDescription',
      );
    }

    if (payload.isActive !== undefined) {
      tobacco.isActive = payload.isActive;
    }

    return tobacco;
  }

  private createHookah(payload: UpsertReferencePayload): HookahReference {
    const hookah: HookahReference = {
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

    this.hookahs.unshift(hookah);

    return hookah;
  }

  private updateHookah(
    id: string,
    payload: UpsertReferencePayload,
  ): HookahReference {
    const hookah = this.findReferenceById(this.hookahs, id, 'Hookah');

    if (payload.manufacturer !== undefined) {
      hookah.manufacturer = this.requireString(
        payload.manufacturer,
        'manufacturer',
      );
    }

    if (payload.name !== undefined) {
      hookah.name = this.requireString(payload.name, 'name');
    }

    if (payload.innerDiameterMm !== undefined) {
      hookah.innerDiameterMm = this.requirePositiveNumber(
        payload.innerDiameterMm,
        'innerDiameterMm',
      );
    }

    if (payload.hasDiffuser !== undefined) {
      hookah.hasDiffuser = payload.hasDiffuser;
    }

    if (payload.isActive !== undefined) {
      hookah.isActive = payload.isActive;
    }

    return hookah;
  }

  private createBowl(payload: UpsertReferencePayload): BowlReference {
    const bowl: BowlReference = {
      id: randomUUID(),
      manufacturer: this.requireString(payload.manufacturer, 'manufacturer'),
      name: this.requireString(payload.name, 'name'),
      bowlType: this.requireBowlType(payload.bowlType),
      material: this.normalizeOptionalValue(payload.material),
      capacityBucket: this.requireCapacityBucket(payload.capacityBucket),
      isActive: payload.isActive ?? true,
    };

    this.bowls.unshift(bowl);

    return bowl;
  }

  private updateBowl(
    id: string,
    payload: UpsertReferencePayload,
  ): BowlReference {
    const bowl = this.findReferenceById(this.bowls, id, 'Bowl');

    if (payload.manufacturer !== undefined) {
      bowl.manufacturer = this.requireString(
        payload.manufacturer,
        'manufacturer',
      );
    }

    if (payload.name !== undefined) {
      bowl.name = this.requireString(payload.name, 'name');
    }

    if (payload.bowlType !== undefined) {
      bowl.bowlType = this.requireBowlType(payload.bowlType);
    }

    if (payload.material !== undefined) {
      bowl.material = this.normalizeOptionalValue(payload.material);
    }

    if (payload.capacityBucket !== undefined) {
      bowl.capacityBucket = this.requireCapacityBucket(payload.capacityBucket);
    }

    if (payload.isActive !== undefined) {
      bowl.isActive = payload.isActive;
    }

    return bowl;
  }

  private createKalaud(payload: UpsertReferencePayload): KalaudReference {
    const kalaud: KalaudReference = {
      id: randomUUID(),
      manufacturer: this.requireString(payload.manufacturer, 'manufacturer'),
      name: this.requireString(payload.name, 'name'),
      material: this.normalizeOptionalValue(payload.material),
      color: this.normalizeOptionalValue(payload.color),
      isActive: payload.isActive ?? true,
    };

    this.kalauds.unshift(kalaud);

    return kalaud;
  }

  private updateKalaud(
    id: string,
    payload: UpsertReferencePayload,
  ): KalaudReference {
    const kalaud = this.findReferenceById(this.kalauds, id, 'Kalaud');

    if (payload.manufacturer !== undefined) {
      kalaud.manufacturer = this.requireString(
        payload.manufacturer,
        'manufacturer',
      );
    }

    if (payload.name !== undefined) {
      kalaud.name = this.requireString(payload.name, 'name');
    }

    if (payload.material !== undefined) {
      kalaud.material = this.normalizeOptionalValue(payload.material);
    }

    if (payload.color !== undefined) {
      kalaud.color = this.normalizeOptionalValue(payload.color);
    }

    if (payload.isActive !== undefined) {
      kalaud.isActive = payload.isActive;
    }

    return kalaud;
  }

  private createCharcoal(payload: UpsertReferencePayload): CharcoalReference {
    const charcoal: CharcoalReference = {
      id: randomUUID(),
      manufacturer: this.requireString(payload.manufacturer, 'manufacturer'),
      name: this.requireString(payload.name, 'name'),
      sizeLabel: this.requireString(payload.sizeLabel, 'sizeLabel'),
      isActive: payload.isActive ?? true,
    };

    this.charcoals.unshift(charcoal);

    return charcoal;
  }

  private updateCharcoal(
    id: string,
    payload: UpsertReferencePayload,
  ): CharcoalReference {
    const charcoal = this.findReferenceById(this.charcoals, id, 'Charcoal');

    if (payload.manufacturer !== undefined) {
      charcoal.manufacturer = this.requireString(
        payload.manufacturer,
        'manufacturer',
      );
    }

    if (payload.name !== undefined) {
      charcoal.name = this.requireString(payload.name, 'name');
    }

    if (payload.sizeLabel !== undefined) {
      charcoal.sizeLabel = this.requireString(payload.sizeLabel, 'sizeLabel');
    }

    if (payload.isActive !== undefined) {
      charcoal.isActive = payload.isActive;
    }

    return charcoal;
  }

  private findReferenceById<T extends { id: string }>(
    collection: T[],
    id: string,
    label: string,
  ): T {
    const item = collection.find((entry) => entry.id === id);

    if (!item) {
      throw new NotFoundException(`${label} not found`);
    }

    return item;
  }

  private findOrder(orderId: string): OrderRecord {
    const order = this.orders.find((entry) => entry.id === orderId);

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  private toPublicUser(user: StoredUser): AppUser {
    return {
      id: user.id,
      login: user.login,
      role: user.role,
      email: user.email,
      telegramUsername: user.telegramUsername,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private toOrderView(order: OrderRecord): OrderView {
    const client = this.findPublicUserById(order.clientUserId);

    if (!client) {
      throw new NotFoundException('Client for order not found');
    }

    return {
      id: order.id,
      status: order.status,
      description: order.description,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      deliveredAt: order.deliveredAt,
      client,
      acceptedBy: order.acceptedByUserId
        ? this.findPublicUserById(order.acceptedByUserId)
        : undefined,
      requestedTobaccos: this.resolveTobaccos(order.requestedTobaccoIds),
      actualTobaccos: this.resolveTobaccos(order.actualTobaccoIds ?? []),
      packingComment: order.packingComment,
      ratingScore: order.ratingScore,
      ratingReview: order.ratingReview,
    };
  }

  private resolveTobaccos(tobaccoIds: string[]): TobaccoReference[] {
    return tobaccoIds
      .map((tobaccoId) =>
        this.tobaccos.find((tobacco) => tobacco.id === tobaccoId),
      )
      .filter((tobacco): tobacco is TobaccoReference => Boolean(tobacco));
  }

  private validateTobaccoSelection(
    tobaccoIds: string[],
    label: string,
  ): string[] {
    const uniqueIds = [...new Set(tobaccoIds)];

    if (uniqueIds.length === 0 || uniqueIds.length > 3) {
      throw new BadRequestException(
        `${label} must contain from 1 to 3 tobaccos`,
      );
    }

    uniqueIds.forEach((tobaccoId) => {
      const tobacco = this.tobaccos.find((entry) => entry.id === tobaccoId);

      if (!tobacco || !tobacco.isActive) {
        throw new BadRequestException('Selected tobacco is not available');
      }
    });

    return uniqueIds;
  }

  private requireString(value: string | undefined, fieldName: string): string {
    const normalized = value?.trim();

    if (!normalized) {
      throw new BadRequestException(`${fieldName} is required`);
    }

    return normalized;
  }

  private requireScaleValue(
    value: number | undefined,
    fieldName: string,
  ): number {
    if (!value || value < 1 || value > 5) {
      throw new BadRequestException(`${fieldName} must be between 1 and 5`);
    }

    return value;
  }

  private requirePositiveNumber(
    value: number | undefined,
    fieldName: string,
  ): number {
    if (value === undefined || value <= 0) {
      throw new BadRequestException(`${fieldName} must be positive`);
    }

    return value;
  }

  private requireBowlType(
    value: string | undefined,
  ): BowlReference['bowlType'] {
    if (
      value !== 'phunnel' &&
      value !== 'killer' &&
      value !== 'turka' &&
      value !== 'elian'
    ) {
      throw new BadRequestException('bowlType is invalid');
    }

    return value;
  }

  private requireCapacityBucket(
    value: string | undefined,
  ): BowlReference['capacityBucket'] {
    if (
      value !== 'bucket' &&
      value !== 'large' &&
      value !== 'medium' &&
      value !== 'small' &&
      value !== 'very_small'
    ) {
      throw new BadRequestException('capacityBucket is invalid');
    }

    return value;
  }

  private normalizeOptionalValue(
    value: string | undefined,
  ): string | undefined {
    const normalized = value?.trim();

    return normalized ? normalized : undefined;
  }

  private seedReferences(): void {
    this.tobaccos.push(
      {
        id: randomUUID(),
        brand: 'Darkside',
        line: 'Core',
        flavorName: 'Supernova',
        lineStrengthLevel: 4,
        estimatedStrengthLevel: 5,
        brightnessLevel: 4,
        flavorDescription: 'Icy mint with a long cooling finish.',
        isActive: true,
      },
      {
        id: randomUUID(),
        brand: 'Darkside',
        line: 'Shot',
        flavorName: 'Bounty Hunter',
        lineStrengthLevel: 5,
        estimatedStrengthLevel: 5,
        brightnessLevel: 3,
        flavorDescription: 'Dense chocolate-coconut dessert profile.',
        isActive: true,
      },
      {
        id: randomUUID(),
        brand: 'Musthave',
        line: 'Classic',
        flavorName: 'Kiwi Smoothie',
        lineStrengthLevel: 3,
        estimatedStrengthLevel: 3,
        brightnessLevel: 3,
        flavorDescription: 'Sweet kiwi and creamy smoothie texture.',
        isActive: true,
      },
      {
        id: randomUUID(),
        brand: 'Black Burn',
        line: 'Classic',
        flavorName: 'Pear Lemonade',
        lineStrengthLevel: 4,
        estimatedStrengthLevel: 4,
        brightnessLevel: 5,
        flavorDescription: 'Bright pear with sparkling lemonade vibe.',
        isActive: true,
      },
      {
        id: randomUUID(),
        brand: 'Sebero',
        line: 'Black',
        flavorName: 'Raspberry Yogurt',
        lineStrengthLevel: 3,
        estimatedStrengthLevel: 2,
        brightnessLevel: 4,
        flavorDescription: 'Soft raspberry dessert with yogurt acidity.',
        isActive: true,
      },
      {
        id: randomUUID(),
        brand: 'Daily Hookah',
        line: 'Classic',
        flavorName: 'Mango Garden',
        lineStrengthLevel: 2,
        estimatedStrengthLevel: 2,
        brightnessLevel: 5,
        flavorDescription: 'Juicy tropical mango with floral lift.',
        isActive: true,
      },
    );

    this.hookahs.push(
      {
        id: randomUUID(),
        manufacturer: 'Alpha Hookah',
        name: 'Model X',
        innerDiameterMm: 13,
        hasDiffuser: true,
        isActive: true,
      },
      {
        id: randomUUID(),
        manufacturer: 'Union Hookah',
        name: 'Sleek Mini',
        innerDiameterMm: 11,
        hasDiffuser: false,
        isActive: true,
      },
    );

    this.bowls.push(
      {
        id: randomUUID(),
        manufacturer: 'Cosmo Bowl',
        name: 'Turkish Phunnel M',
        bowlType: 'phunnel',
        material: 'clay',
        capacityBucket: 'medium',
        isActive: true,
      },
      {
        id: randomUUID(),
        manufacturer: 'Moonrave',
        name: 'Killer One',
        bowlType: 'killer',
        material: 'stone',
        capacityBucket: 'small',
        isActive: true,
      },
    );

    this.kalauds.push(
      {
        id: randomUUID(),
        manufacturer: 'Kaloud',
        name: 'Lotus I+',
        material: 'aluminum',
        color: 'black',
        isActive: true,
      },
      {
        id: randomUUID(),
        manufacturer: 'Na Grani',
        name: 'Control 2.0',
        material: 'stainless steel',
        color: 'silver',
        isActive: true,
      },
    );

    this.charcoals.push(
      {
        id: randomUUID(),
        manufacturer: 'CocoLoco',
        name: 'Cube',
        sizeLabel: '25mm',
        isActive: true,
      },
      {
        id: randomUUID(),
        manufacturer: 'Crown',
        name: 'Flat',
        sizeLabel: '26mm',
        isActive: true,
      },
    );
  }
}
