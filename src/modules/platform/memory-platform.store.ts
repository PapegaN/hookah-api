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
  OrderFeedbackRecord,
  OrderFeedbackView,
  OrderParticipantRecord,
  OrderRecord,
  OrderTimelineEntryRecord,
  OrderView,
  ReferencesSnapshot,
  StoredUser,
  TobaccoReference,
  UpsertReferencePayload,
} from './platform.models';
import {
  OrderStatus,
  OrderTimelineEventType,
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

    const admin = this.createUserRecord({
      login: 'admin',
      passwordHash: hashes.admin,
      role: UserRole.Admin,
      email: 'admin@hookah.local',
      telegramUsername: 'hookah_admin',
      isApproved: true,
      approvedByUserId: undefined,
    });
    const master = this.createUserRecord({
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

    const timestamp = new Date().toISOString();

    this.orders.push({
      id: randomUUID(),
      tableLabel: 'Стол 3',
      status: OrderStatus.New,
      createdAt: timestamp,
      updatedAt: timestamp,
      deliveredAt: undefined,
      feedbackAt: undefined,
      acceptedByUserId: undefined,
      actualTobaccoIds: undefined,
      packingComment: undefined,
      participants: [
        {
          clientUserId: client.id,
          description: 'Хочу ягодный микс с холодком и мягкой крепостью.',
          requestedTobaccoIds: [
            this.tobaccos[0]?.id ?? '',
            this.tobaccos[2]?.id ?? '',
          ].filter((value) => value.length > 0),
          joinedAt: timestamp,
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
          occurredAt: timestamp,
          actorUserId: client.id,
          note: 'Клиент создал заказ для стола 3.',
        }),
      ],
    });

    if (!master) {
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
    return this.users
      .slice()
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((user) => this.toPublicUser(user));
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
    const targetUser = this.findStoredUserById(userId);

    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    if (payload.login !== undefined) {
      const normalizedLogin = this.requireString(payload.login, 'login');
      const loginOwner = this.findStoredUserByLogin(normalizedLogin);

      if (loginOwner && loginOwner.id !== userId) {
        throw new BadRequestException('Login is already in use');
      }

      targetUser.login = normalizedLogin;
    }

    if (payload.role !== undefined) {
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

    if (payload.isApproved !== undefined) {
      const timestamp = new Date().toISOString();

      if (payload.isApproved) {
        targetUser.isApproved = true;
        targetUser.approvedAt = timestamp;
        targetUser.approvedByUserId = actorUserId;
      } else {
        targetUser.isApproved = false;
        targetUser.approvedAt = undefined;
        targetUser.approvedByUserId = undefined;
      }
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
    if (!currentUser.isApproved) {
      return [];
    }

    const visibleOrders =
      currentUser.role === UserRole.Client
        ? this.orders.filter((order) =>
            order.participants.some(
              (participant) => participant.clientUserId === currentUser.id,
            ),
          )
        : this.orders;

    return visibleOrders
      .slice()
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((order) => this.toOrderView(order));
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
      requestedTobaccoIds: string[];
    },
  ): OrderView {
    const client = this.findStoredUserById(clientUserId);

    if (!client || !client.isApproved) {
      throw new BadRequestException('Client approval is required');
    }

    const tableLabel = this.requireString(input.tableLabel, 'tableLabel');
    const requestedTobaccoIds = this.validateTobaccoSelection(
      input.requestedTobaccoIds,
      'requested blend',
    );
    const timestamp = new Date().toISOString();
    const participant: OrderParticipantRecord = {
      clientUserId,
      description: this.requireString(input.description, 'description'),
      requestedTobaccoIds,
      joinedAt: timestamp,
      tableApprovalStatus: TableApprovalStatus.Pending,
      tableApprovedAt: undefined,
      tableApprovedByUserId: undefined,
      feedback: undefined,
    };
    const openOrder = this.findOpenOrderForTable(tableLabel);

    if (openOrder) {
      if (
        openOrder.participants.some(
          (entry) => entry.clientUserId === participant.clientUserId,
        )
      ) {
        throw new BadRequestException(
          'Client already joined the active order for this table',
        );
      }

      openOrder.participants.push(participant);
      openOrder.updatedAt = timestamp;
      openOrder.timeline.unshift(
        this.createTimelineEntry({
          type: OrderTimelineEventType.ParticipantJoined,
          status: openOrder.status,
          occurredAt: timestamp,
          actorUserId: clientUserId,
          note: `${client.login} присоединился к заказу стола ${tableLabel}.`,
        }),
      );

      return this.toOrderView(openOrder);
    }

    const order: OrderRecord = {
      id: randomUUID(),
      tableLabel,
      status: OrderStatus.New,
      createdAt: timestamp,
      updatedAt: timestamp,
      deliveredAt: undefined,
      feedbackAt: undefined,
      acceptedByUserId: undefined,
      actualTobaccoIds: undefined,
      packingComment: undefined,
      participants: [participant],
      timeline: [
        this.createTimelineEntry({
          type: OrderTimelineEventType.Created,
          status: OrderStatus.New,
          occurredAt: timestamp,
          actorUserId: clientUserId,
          note: `${client.login} создал заказ для стола ${tableLabel}.`,
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
    const client = this.findStoredUserById(clientUserId);

    if (!participant || !client) {
      throw new NotFoundException('Participant not found');
    }

    if (participant.tableApprovalStatus === TableApprovalStatus.Approved) {
      return this.toOrderView(order);
    }

    const timestamp = new Date().toISOString();

    participant.tableApprovalStatus = TableApprovalStatus.Approved;
    participant.tableApprovedAt = timestamp;
    participant.tableApprovedByUserId = actorUserId;
    order.updatedAt = timestamp;
    order.timeline.unshift(
      this.createTimelineEntry({
        type: OrderTimelineEventType.ParticipantTableApproved,
        status: order.status,
        occurredAt: timestamp,
        actorUserId,
        note: `${client.login} подтверждён за ${order.tableLabel}.`,
      }),
    );

    return this.toOrderView(order);
  }

  startOrder(orderId: string, actorUserId: string): OrderView {
    const order = this.findOrder(orderId);

    if (order.status !== OrderStatus.New) {
      throw new BadRequestException('Only new orders can be taken into work');
    }

    const timestamp = new Date().toISOString();

    order.status = OrderStatus.InProgress;
    order.acceptedByUserId = actorUserId;
    order.updatedAt = timestamp;
    order.timeline.unshift(
      this.createTimelineEntry({
        type: OrderTimelineEventType.Started,
        status: order.status,
        occurredAt: timestamp,
        actorUserId,
        note: `Заказ для ${order.tableLabel} взят в работу.`,
      }),
    );

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

    const timestamp = new Date().toISOString();

    order.status = OrderStatus.ReadyForFeedback;
    order.acceptedByUserId = actorUserId;
    order.actualTobaccoIds = this.validateTobaccoSelection(
      input.actualTobaccoIds,
      'actual packing',
    );
    order.packingComment = this.normalizeOptionalValue(input.packingComment);
    order.deliveredAt = timestamp;
    order.updatedAt = timestamp;
    order.timeline.unshift(
      this.createTimelineEntry({
        type: OrderTimelineEventType.Delivered,
        status: order.status,
        occurredAt: timestamp,
        actorUserId,
        note: `Заказ для ${order.tableLabel} отдан клиентам.`,
      }),
    );

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

    if (
      order.status !== OrderStatus.ReadyForFeedback &&
      order.status !== OrderStatus.Rated
    ) {
      throw new BadRequestException(
        'Feedback is available only after order delivery',
      );
    }

    if (participant.feedback) {
      throw new BadRequestException('Feedback already exists for this client');
    }

    const timestamp = new Date().toISOString();

    participant.feedback = {
      clientUserId: actor.id,
      ratingScore: this.requireScaleValue(input.ratingScore, 'ratingScore'),
      ratingReview: this.normalizeOptionalValue(input.ratingReview),
      submittedAt: timestamp,
    };
    order.feedbackAt = timestamp;
    order.updatedAt = timestamp;
    order.status = order.participants.every((entry) => entry.feedback)
      ? OrderStatus.Rated
      : OrderStatus.ReadyForFeedback;
    order.timeline.unshift(
      this.createTimelineEntry({
        type: OrderTimelineEventType.FeedbackReceived,
        status: order.status,
        occurredAt: timestamp,
        actorUserId: actor.id,
        note: `${actor.login} оставил отзыв по заказу ${order.tableLabel}.`,
      }),
    );

    return this.toOrderView(order);
  }

  private createUserRecord(input: CreateUserInput): AppUser {
    const normalizedLogin = this.requireString(input.login, 'login');

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
      isApproved: input.isApproved,
      approvedAt: input.isApproved ? timestamp : undefined,
      approvedByUserId: input.approvedByUserId,
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

  private findOpenOrderForTable(tableLabel: string): OrderRecord | undefined {
    return this.orders.find(
      (order) =>
        order.tableLabel.toLowerCase() === tableLabel.toLowerCase() &&
        (order.status === OrderStatus.New ||
          order.status === OrderStatus.InProgress),
    );
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
      approvedBy: this.toUserPreview(user.approvedByUserId),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private toOrderView(order: OrderRecord): OrderView {
    const participants = order.participants.map((participant) => {
      const client = this.findPublicUserById(participant.clientUserId);

      if (!client) {
        throw new NotFoundException('Client for order not found');
      }

      return {
        client,
        description: participant.description,
        joinedAt: participant.joinedAt,
        requestedTobaccos: this.resolveTobaccos(
          participant.requestedTobaccoIds,
        ),
        tableApprovalStatus: participant.tableApprovalStatus,
        tableApprovedAt: participant.tableApprovedAt,
        tableApprovedBy: this.toUserPreview(participant.tableApprovedByUserId),
        feedback: participant.feedback
          ? this.toFeedbackView(participant.feedback)
          : undefined,
      };
    });
    const feedbacks = participants
      .map((participant) => participant.feedback)
      .filter((feedback): feedback is NonNullable<typeof feedback> =>
        Boolean(feedback),
      );

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
      participants,
      requestedTobaccos: this.resolveDistinctTobaccos(
        order.participants.map(
          (participant) => participant.requestedTobaccoIds,
        ),
      ),
      actualTobaccos: this.resolveTobaccos(order.actualTobaccoIds ?? []),
      packingComment: order.packingComment,
      feedbacks,
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

  private toUserPreview(userId: string | undefined):
    | {
        id: string;
        login: string;
      }
    | undefined {
    if (!userId) {
      return undefined;
    }

    const user = this.findStoredUserById(userId);

    return user
      ? {
          id: user.id,
          login: user.login,
        }
      : undefined;
  }

  private resolveTobaccos(tobaccoIds: string[]): TobaccoReference[] {
    return tobaccoIds
      .map((tobaccoId) =>
        this.tobaccos.find((tobacco) => tobacco.id === tobaccoId),
      )
      .filter((tobacco): tobacco is TobaccoReference => Boolean(tobacco));
  }

  private resolveDistinctTobaccos(
    tobaccoIdsList: string[][],
  ): TobaccoReference[] {
    return this.resolveTobaccos([...new Set(tobaccoIdsList.flat())]);
  }

  private toFeedbackView(feedback: OrderFeedbackRecord): OrderFeedbackView {
    const client = this.findPublicUserById(feedback.clientUserId);

    if (!client) {
      throw new NotFoundException('Client for feedback not found');
    }

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

  private validateTobaccoSelection(
    tobaccoIds: string[],
    label: string,
  ): string[] {
    const uniqueIds = [...new Set(tobaccoIds)];

    if (uniqueIds.length === 0 || uniqueIds.length > 3) {
      throw new BadRequestException(
        `${label} should contain from 1 to 3 tobaccos`,
      );
    }

    uniqueIds.forEach((tobaccoId) => {
      if (!this.tobaccos.some((tobacco) => tobacco.id === tobaccoId)) {
        throw new BadRequestException(`Unknown tobacco in ${label}`);
      }
    });

    return uniqueIds;
  }

  private requireString(
    value: string | number | boolean | undefined,
    label: string,
  ): string {
    if (typeof value !== 'string') {
      throw new BadRequestException(`${label} must be a string`);
    }

    const normalized = value.trim();

    if (normalized.length === 0) {
      throw new BadRequestException(`${label} must not be empty`);
    }

    return normalized;
  }

  private requireScaleValue(
    value: string | number | boolean | undefined,
    label: string,
  ): number {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      throw new BadRequestException(`${label} must be an integer`);
    }

    if (value < 1 || value > 5) {
      throw new BadRequestException(`${label} must be between 1 and 5`);
    }

    return value;
  }

  private requirePositiveNumber(
    value: string | number | boolean | undefined,
    label: string,
  ): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      throw new BadRequestException(`${label} must be a positive number`);
    }

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
    ) {
      throw new BadRequestException('bowlType is invalid');
    }

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
    ) {
      throw new BadRequestException('capacityBucket is invalid');
    }

    return value;
  }

  private normalizeOptionalValue(
    value: string | number | boolean | undefined,
  ): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.trim();

    return normalized.length > 0 ? normalized : undefined;
  }

  private seedReferences(): void {
    this.tobaccos.push(
      {
        id: randomUUID(),
        brand: 'Darkside',
        line: 'Core',
        flavorName: 'Bounty Hunter',
        lineStrengthLevel: 4,
        estimatedStrengthLevel: 4,
        brightnessLevel: 3,
        flavorDescription: 'Шоколадно-кокосовый десертный вкус.',
        isActive: true,
      },
      {
        id: randomUUID(),
        brand: 'Must Have',
        line: 'Classic',
        flavorName: 'Pinkman',
        lineStrengthLevel: 3,
        estimatedStrengthLevel: 3,
        brightnessLevel: 5,
        flavorDescription: 'Яркий ягодный микс с цитрусовой свежестью.',
        isActive: true,
      },
      {
        id: randomUUID(),
        brand: 'Black Burn',
        line: 'Base',
        flavorName: 'Mint Shock',
        lineStrengthLevel: 4,
        estimatedStrengthLevel: 4,
        brightnessLevel: 4,
        flavorDescription: 'Мощная мята с выраженным холодком.',
        isActive: true,
      },
      {
        id: randomUUID(),
        brand: 'Element',
        line: 'Water',
        flavorName: 'Pear Lemonade',
        lineStrengthLevel: 2,
        estimatedStrengthLevel: 2,
        brightnessLevel: 4,
        flavorDescription: 'Сладкая груша с лимонадным профилем.',
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
        manufacturer: 'MattPear',
        name: 'Simple M',
        innerDiameterMm: 11,
        hasDiffuser: false,
        isActive: true,
      },
    );

    this.bowls.push(
      {
        id: randomUUID(),
        manufacturer: 'Werkbund',
        name: 'Turkish Killer',
        bowlType: 'killer',
        material: 'Глина',
        capacityBucket: 'medium',
        isActive: true,
      },
      {
        id: randomUUID(),
        manufacturer: 'Voskurimsya',
        name: 'Phunnel One',
        bowlType: 'phunnel',
        material: 'Фарфор',
        capacityBucket: 'small',
        isActive: true,
      },
    );

    this.kalauds.push(
      {
        id: randomUUID(),
        manufacturer: 'Na Grani',
        name: 'HMD Pro',
        material: 'Алюминий',
        color: 'Черный',
        isActive: true,
      },
      {
        id: randomUUID(),
        manufacturer: 'Conceptic',
        name: 'Heat Keeper',
        material: 'Сталь',
        color: 'Серебристый',
        isActive: true,
      },
    );

    this.charcoals.push(
      {
        id: randomUUID(),
        manufacturer: 'CocoUrth',
        name: 'Cube',
        sizeLabel: '25 мм',
        isActive: true,
      },
      {
        id: randomUUID(),
        manufacturer: 'Crown',
        name: 'Big Cube',
        sizeLabel: '26 мм',
        isActive: true,
      },
    );
  }
}
