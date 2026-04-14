import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import {
  DatabaseService,
  type DatabaseRow,
} from '../database/database.service';
import type {
  AppUser,
  BackupAuditEvent,
  BowlReference,
  CharcoalReference,
  ElectricHeadReference,
  HookahReference,
  KalaudReference,
  OrderBlendComponentView,
  OrderFeedbackView,
  OrderParticipantView,
  OrderSetupInput,
  OrderSetupView,
  OrderTimelineEntryView,
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

type Queryable = {
  query: (
    text: string,
    values?: ReadonlyArray<unknown>,
  ) => Promise<{
    rows: DatabaseRow[];
    rowCount: number | null;
  }>;
};

interface CreateUserInput {
  login: string;
  passwordHash: string;
  role: UserRole;
  email: string | undefined;
  telegramUsername: string | undefined;
  isApproved: boolean;
  approvedByUserId: string | undefined;
}

interface ImportSummary {
  importedCount: number;
}

interface BackupPayload {
  users: StoredUser[];
  references: ReferencesSnapshot;
  orders: OrderView[];
}

interface BackupEnvelope {
  schemaVersion: 'hookah-backup.v2';
  exportedAt: string;
  resource: 'backup';
  checksumSha256: string;
  payload: BackupPayload;
}

@Injectable()
export class PostgresPlatformStore {
  constructor(private readonly databaseService: DatabaseService) {}

  async findStoredUserByLogin(login: string): Promise<StoredUser | undefined> {
    const result = await this.databaseService.query(
      `${this.userSelectSql()} where user_account.login = $1 limit 1`,
      [login.trim()],
    );

    return result.rows[0] ? this.mapStoredUser(result.rows[0]) : undefined;
  }

  async findStoredUserById(id: string): Promise<StoredUser | undefined> {
    const result = await this.databaseService.query(
      `${this.userSelectSql()} where user_account.id = $1 limit 1`,
      [id],
    );

    return result.rows[0] ? this.mapStoredUser(result.rows[0]) : undefined;
  }

  async findPublicUserById(id: string): Promise<AppUser | undefined> {
    const result = await this.databaseService.query(
      `${this.userSelectSql()} where user_account.id = $1 limit 1`,
      [id],
    );

    return result.rows[0] ? this.mapPublicUser(result.rows[0]) : undefined;
  }

  async listUsers(): Promise<AppUser[]> {
    const result = await this.databaseService.query(
      `${this.userSelectSql()} order by user_account.created_at desc`,
    );

    return result.rows.map((row) => this.mapPublicUser(row));
  }

  async registerClient(
    input: Omit<CreateUserInput, 'role' | 'isApproved' | 'approvedByUserId'>,
  ): Promise<AppUser> {
    return this.createUserRecord({
      ...input,
      role: UserRole.Client,
      isApproved: false,
      approvedByUserId: undefined,
    });
  }

  async createUserByAdmin(
    actorUserId: string,
    input: Omit<CreateUserInput, 'approvedByUserId'>,
  ): Promise<AppUser> {
    return this.createUserRecord({
      ...input,
      approvedByUserId: input.isApproved ? actorUserId : undefined,
    });
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
    const existingUser = await this.findStoredUserById(userId);

    if (!existingUser) {
      throw new NotFoundException('User not found');
    }

    const normalizedLogin =
      payload.login !== undefined
        ? this.requireString(payload.login, 'login')
        : existingUser.login;
    const normalizedEmail =
      payload.email !== undefined
        ? this.normalizeOptionalValue(payload.email)
        : existingUser.email;
    const normalizedTelegram =
      payload.telegramUsername !== undefined
        ? this.normalizeOptionalValue(payload.telegramUsername)
        : existingUser.telegramUsername;
    const nextRole = payload.role ?? existingUser.role;
    const approvalState = payload.isApproved ?? existingUser.isApproved;
    const approvedAt = approvalState
      ? payload.isApproved === true && !existingUser.isApproved
        ? new Date().toISOString()
        : (existingUser.approvedAt ?? new Date().toISOString())
      : undefined;
    const approvedByUserId = approvalState
      ? payload.isApproved === true && !existingUser.isApproved
        ? actorUserId
        : existingUser.approvedByUserId
      : undefined;

    try {
      await this.databaseService.query(
        `
          update auth.users
          set
            login = $2,
            role = $3,
            email = $4,
            telegram_username = $5,
            is_approved = $6,
            approved_at = $7,
            approved_by_user_id = $8
          where id = $1
        `,
        [
          userId,
          normalizedLogin,
          nextRole,
          normalizedEmail ?? null,
          normalizedTelegram ?? null,
          approvalState,
          approvedAt ?? null,
          approvedByUserId ?? null,
        ],
      );
    } catch (error) {
      this.handleConstraintError(error);
    }

    const updatedUser = await this.findPublicUserById(userId);

    if (!updatedUser) {
      throw new NotFoundException('User not found');
    }

    return updatedUser;
  }

  async getReferencesSnapshot(): Promise<ReferencesSnapshot> {
    const [
      tobaccos,
      tobaccoTags,
      hookahs,
      bowls,
      kalauds,
      charcoals,
      electricHeads,
    ] = await Promise.all([
      this.listTobaccos(),
      this.listTobaccoTags(),
      this.listHookahs(),
      this.listBowls(),
      this.listKalauds(),
      this.listCharcoals(),
      this.listElectricHeads(),
    ]);

    return {
      tobaccos,
      tobaccoTags,
      hookahs,
      bowls,
      kalauds,
      charcoals,
      electricHeads,
    };
  }

  async createReference(
    type: ReferenceEntityType,
    payload: UpsertReferencePayload,
  ): Promise<
    | TobaccoReference
    | TobaccoTagReference
    | HookahReference
    | BowlReference
    | KalaudReference
    | CharcoalReference
    | ElectricHeadReference
  > {
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

  async updateReference(
    type: ReferenceEntityType,
    id: string,
    payload: UpsertReferencePayload,
  ): Promise<
    | TobaccoReference
    | TobaccoTagReference
    | HookahReference
    | BowlReference
    | KalaudReference
    | CharcoalReference
    | ElectricHeadReference
  > {
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

  async listOrdersForUser(currentUser: AppUser): Promise<OrderView[]> {
    if (!currentUser.isApproved) {
      return [];
    }

    const orderResult =
      currentUser.role === UserRole.Client
        ? await this.databaseService.query(
            `
              select distinct sales_order.id::text as id
              from sales.orders sales_order
              join sales.order_participants participant
                on participant.order_id = sales_order.id
              where participant.client_user_id = $1
              order by id
            `,
            [currentUser.id],
          )
        : await this.databaseService.query(
            `select sales_order.id::text as id from sales.orders sales_order`,
          );

    return this.loadOrders(orderResult.rows.map((row) => row.id as string));
  }

  async getOrderById(
    orderId: string,
    currentUser: AppUser,
  ): Promise<OrderView> {
    const orders = await this.listOrdersForUser(currentUser);
    const order = orders.find((item) => item.id === orderId);

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  async createOrder(
    clientUserId: string,
    input: {
      tableLabel: string;
      description: string;
      requestedBlend: Array<{ tobaccoId: string; percentage: number }>;
      requestedSetup: OrderSetupInput;
      wantsCooling: boolean;
      wantsMint: boolean;
      wantsSpicy: boolean;
    },
  ): Promise<OrderView> {
    const client = await this.findStoredUserById(clientUserId);

    if (!client || !client.isApproved) {
      throw new BadRequestException('Client approval is required');
    }

    const tableLabel = this.requireString(input.tableLabel, 'tableLabel');
    const description = this.requireString(input.description, 'description');
    const requestedBlend = await this.validateBlendSelection(
      input.requestedBlend,
      'requested blend',
    );
    const requestedSetup = await this.validateOrderSetupInput(
      input.requestedSetup,
      'requestedSetup',
    );

    const orderId = await this.databaseService.withTransaction(
      async (transaction) => {
        const openOrderResult = await transaction.query(
          `
          select id::text as id
          from sales.orders
          where lower(table_label) = lower($1)
            and status in ($2, $3)
          order by created_at desc
          limit 1
        `,
          [tableLabel, OrderStatus.New, OrderStatus.InProgress],
        );

        const existingOrderRow = openOrderResult.rows[0] as
          | DatabaseRow
          | undefined;
        const existingOrderId = existingOrderRow?.id as string | undefined;

        if (existingOrderId) {
          const duplicateParticipant = await transaction.query(
            `
            select 1
            from sales.order_participants
            where order_id = $1 and client_user_id = $2
          `,
            [existingOrderId, clientUserId],
          );

          if ((duplicateParticipant.rowCount ?? 0) > 0) {
            throw new BadRequestException(
              'Client already joined the active order for this table',
            );
          }

          const participantId = randomUUID();

          await transaction.query(
            `
            insert into sales.order_participants (
              id,
              order_id,
              client_user_id,
              description,
              wants_cooling,
              wants_mint,
              wants_spicy
            )
            values ($1, $2, $3, $4, $5, $6, $7)
          `,
            [
              participantId,
              existingOrderId,
              clientUserId,
              description,
              input.wantsCooling,
              input.wantsMint,
              input.wantsSpicy,
            ],
          );

          await this.insertParticipantTobaccos(
            transaction,
            participantId,
            requestedBlend,
          );

          await transaction.query(
            `
            insert into sales.order_timeline (
              id,
              order_id,
              event_type,
              status,
              actor_user_id,
              note
            )
            values ($1, $2, $3, (
              select status from sales.orders where id = $2
            ), $4, $5)
          `,
            [
              randomUUID(),
              existingOrderId,
              OrderTimelineEventType.ParticipantJoined,
              clientUserId,
              `${client.login} присоединился к заказу стола ${tableLabel}.`,
            ],
          );

          return existingOrderId;
        }

        const createdOrderId = randomUUID();
        const participantId = randomUUID();

        await transaction.query(
          `
          insert into sales.orders (
            id,
            status,
            service_type,
            table_label,
            total_amount,
            requested_heating_system_type,
            requested_packing_style,
            requested_custom_packing_style,
            requested_hookah_id,
            requested_bowl_id,
            requested_kalaud_id,
            requested_charcoal_id,
            requested_electric_head_id,
            requested_charcoal_count,
            requested_warmup_mode,
            requested_warmup_duration_minutes
          )
          values (
            $1, $2, 'hookah', $3, 0,
            $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
          )
        `,
          [
            createdOrderId,
            OrderStatus.New,
            tableLabel,
            requestedSetup.heatingSystemType,
            requestedSetup.packingStyle ?? null,
            requestedSetup.customPackingStyle ?? null,
            requestedSetup.hookahId ?? null,
            requestedSetup.bowlId ?? null,
            requestedSetup.kalaudId ?? null,
            requestedSetup.charcoalId ?? null,
            requestedSetup.electricHeadId ?? null,
            requestedSetup.charcoalCount ?? null,
            requestedSetup.warmupMode ?? null,
            requestedSetup.warmupDurationMinutes ?? null,
          ],
        );

        await transaction.query(
          `
          insert into sales.order_participants (
            id,
            order_id,
            client_user_id,
            description,
            wants_cooling,
            wants_mint,
            wants_spicy
          )
          values ($1, $2, $3, $4, $5, $6, $7)
        `,
          [
            participantId,
            createdOrderId,
            clientUserId,
            description,
            input.wantsCooling,
            input.wantsMint,
            input.wantsSpicy,
          ],
        );

        await this.insertParticipantTobaccos(
          transaction,
          participantId,
          requestedBlend,
        );

        await transaction.query(
          `
          insert into sales.order_timeline (
            id,
            order_id,
            event_type,
            status,
            actor_user_id,
            note
          )
          values ($1, $2, $3, $4, $5, $6)
        `,
          [
            randomUUID(),
            createdOrderId,
            OrderTimelineEventType.Created,
            OrderStatus.New,
            clientUserId,
            `${client.login} создал заказ для стола ${tableLabel}.`,
          ],
        );

        return createdOrderId;
      },
    );

    const actor = await this.findPublicUserById(clientUserId);

    if (!actor) {
      throw new NotFoundException('User not found');
    }

    return this.getOrderById(orderId, actor);
  }

  async approveParticipantTable(
    orderId: string,
    clientUserId: string,
    actorUserId: string,
  ): Promise<OrderView> {
    const client = await this.findStoredUserById(clientUserId);

    if (!client) {
      throw new NotFoundException('Participant not found');
    }

    await this.databaseService.withTransaction(async (transaction) => {
      const participantResult = await transaction.query(
        `
          select id::text as id, table_approval_status::text as table_approval_status
          from sales.order_participants
          where order_id = $1 and client_user_id = $2
          limit 1
        `,
        [orderId, clientUserId],
      );

      const participant = participantResult.rows[0] as DatabaseRow | undefined;

      if (!participant) {
        throw new NotFoundException('Participant not found');
      }

      if (participant.table_approval_status === TableApprovalStatus.Approved) {
        return;
      }

      await transaction.query(
        `
          update sales.order_participants
          set
            table_approval_status = $3,
            table_approved_at = now(),
            table_approved_by_user_id = $4
          where id = $1 and order_id = $2
        `,
        [participant.id, orderId, TableApprovalStatus.Approved, actorUserId],
      );

      await transaction.query(
        `
          insert into sales.order_timeline (
            id,
            order_id,
            event_type,
            status,
            actor_user_id,
            note
          )
          values ($1, $2, $3, (
            select status from sales.orders where id = $2
          ), $4, $5)
        `,
        [
          randomUUID(),
          orderId,
          OrderTimelineEventType.ParticipantTableApproved,
          actorUserId,
          `${client.login} подтвержден за ${await this.getOrderTableLabel(
            orderId,
            transaction,
          )}.`,
        ],
      );
    });

    const actor = await this.findPublicUserById(actorUserId);

    if (!actor) {
      throw new NotFoundException('User not found');
    }

    return this.getOrderById(orderId, actor);
  }

  async startOrder(orderId: string, actorUserId: string): Promise<OrderView> {
    await this.databaseService.withTransaction(async (transaction) => {
      const order = await this.getOrderMeta(orderId, transaction);

      if (order.status !== OrderStatus.New) {
        throw new BadRequestException('Only new orders can be taken into work');
      }

      await transaction.query(
        `
          update sales.orders
          set
            status = $2,
            accepted_by_user_id = $3
          where id = $1
        `,
        [orderId, OrderStatus.InProgress, actorUserId],
      );

      await transaction.query(
        `
          insert into sales.order_timeline (
            id,
            order_id,
            event_type,
            status,
            actor_user_id,
            note
          )
          values ($1, $2, $3, $4, $5, $6)
        `,
        [
          randomUUID(),
          orderId,
          OrderTimelineEventType.Started,
          OrderStatus.InProgress,
          actorUserId,
          `Заказ для ${order.tableLabel} взят в работу.`,
        ],
      );
    });

    const actor = await this.findPublicUserById(actorUserId);

    if (!actor) {
      throw new NotFoundException('User not found');
    }

    return this.getOrderById(orderId, actor);
  }

  async fulfillOrder(
    orderId: string,
    actorUserId: string,
    input: {
      actualBlend: Array<{ tobaccoId: string; percentage: number }>;
      actualSetup: OrderSetupInput;
      packingComment: string;
    },
  ): Promise<OrderView> {
    const actualBlend = await this.validateBlendSelection(
      input.actualBlend,
      'actual packing',
    );
    const actualSetup = await this.validateOrderSetupInput(
      input.actualSetup,
      'actualSetup',
    );

    await this.databaseService.withTransaction(async (transaction) => {
      const order = await this.getOrderMeta(orderId, transaction);

      if (
        order.status !== OrderStatus.New &&
        order.status !== OrderStatus.InProgress
      ) {
        throw new BadRequestException(
          'Order cannot be fulfilled in current state',
        );
      }

      await transaction.query(
        `
          update sales.orders
          set
            status = $2,
            accepted_by_user_id = $3,
            delivered_at = now(),
            packing_comment = $4,
            actual_heating_system_type = $5,
            actual_packing_style = $6,
            actual_custom_packing_style = $7,
            actual_hookah_id = $8,
            actual_bowl_id = $9,
            actual_kalaud_id = $10,
            actual_charcoal_id = $11,
            actual_electric_head_id = $12,
            actual_charcoal_count = $13,
            actual_warmup_mode = $14,
            actual_warmup_duration_minutes = $15
          where id = $1
        `,
        [
          orderId,
          OrderStatus.ReadyForFeedback,
          actorUserId,
          this.normalizeOptionalValue(input.packingComment) ?? null,
          actualSetup.heatingSystemType,
          actualSetup.packingStyle ?? null,
          actualSetup.customPackingStyle ?? null,
          actualSetup.hookahId ?? null,
          actualSetup.bowlId ?? null,
          actualSetup.kalaudId ?? null,
          actualSetup.charcoalId ?? null,
          actualSetup.electricHeadId ?? null,
          actualSetup.charcoalCount ?? null,
          actualSetup.warmupMode ?? null,
          actualSetup.warmupDurationMinutes ?? null,
        ],
      );

      await transaction.query(
        `delete from sales.order_actual_tobaccos where order_id = $1`,
        [orderId],
      );

      await this.insertOrderTobaccos(transaction, orderId, actualBlend);

      await transaction.query(
        `
          insert into sales.order_timeline (
            id,
            order_id,
            event_type,
            status,
            actor_user_id,
            note
          )
          values ($1, $2, $3, $4, $5, $6)
        `,
        [
          randomUUID(),
          orderId,
          OrderTimelineEventType.Delivered,
          OrderStatus.ReadyForFeedback,
          actorUserId,
          `Заказ для ${order.tableLabel} отдан клиентам.`,
        ],
      );
    });

    const actor = await this.findPublicUserById(actorUserId);

    if (!actor) {
      throw new NotFoundException('User not found');
    }

    return this.getOrderById(orderId, actor);
  }

  async submitOrderFeedback(
    orderId: string,
    actor: AppUser,
    input: { ratingScore: number; ratingReview?: string },
  ): Promise<OrderView> {
    const ratingScore = this.requireScaleValue(
      input.ratingScore,
      'ratingScore',
    );

    await this.databaseService.withTransaction(async (transaction) => {
      const order = await this.getOrderMeta(orderId, transaction);

      if (
        order.status !== OrderStatus.ReadyForFeedback &&
        order.status !== OrderStatus.Rated
      ) {
        throw new BadRequestException(
          'Feedback is available only after order delivery',
        );
      }

      const participantResult = await transaction.query(
        `
          select id::text as id
          from sales.order_participants
          where order_id = $1 and client_user_id = $2
          limit 1
        `,
        [orderId, actor.id],
      );

      const participant = participantResult.rows[0] as DatabaseRow | undefined;

      if (!participant) {
        throw new BadRequestException(
          'Client can leave feedback only for joined table order',
        );
      }

      const existingFeedback = await transaction.query(
        `
          select 1
          from sales.order_feedbacks
          where participant_id = $1
        `,
        [participant.id],
      );

      if ((existingFeedback.rowCount ?? 0) > 0) {
        throw new BadRequestException(
          'Feedback already exists for this client',
        );
      }

      await transaction.query(
        `
          insert into sales.order_feedbacks (
            id,
            order_id,
            participant_id,
            rating_score,
            rating_review
          )
          values ($1, $2, $3, $4, $5)
        `,
        [
          randomUUID(),
          orderId,
          participant.id,
          ratingScore,
          this.normalizeOptionalValue(input.ratingReview) ?? null,
        ],
      );

      const summaryResult = await transaction.query(
        `
          select
            (select count(*) from sales.order_participants where order_id = $1)::int as participant_count,
            (select count(*) from sales.order_feedbacks where order_id = $1)::int as feedback_count
        `,
        [orderId],
      );

      const summary = summaryResult.rows[0] as {
        participant_count: number;
        feedback_count: number;
      };
      const nextStatus =
        summary.participant_count === summary.feedback_count
          ? OrderStatus.Rated
          : OrderStatus.ReadyForFeedback;

      await transaction.query(
        `
          update sales.orders
          set
            status = $2,
            feedback_at = now()
          where id = $1
        `,
        [orderId, nextStatus],
      );

      await transaction.query(
        `
          insert into sales.order_timeline (
            id,
            order_id,
            event_type,
            status,
            actor_user_id,
            note
          )
          values ($1, $2, $3, $4, $5, $6)
        `,
        [
          randomUUID(),
          orderId,
          OrderTimelineEventType.FeedbackReceived,
          nextStatus,
          actor.id,
          `${actor.login} оставил отзыв по заказу ${order.tableLabel}.`,
        ],
      );
    });

    return this.getOrderById(orderId, actor);
  }

  async exportResource(
    resource:
      | 'users'
      | 'orders'
      | 'backup'
      | 'backup_audit'
      | ReferenceEntityType,
  ): Promise<unknown> {
    switch (resource) {
      case 'users':
        return this.listStoredUsers();
      case 'orders':
        return this.listAllOrders();
      case 'backup':
        return this.exportBackup();
      case 'backup_audit':
        return this.listBackupAuditEvents();
      case ReferenceEntityType.Tobaccos:
        return (await this.getReferencesSnapshot()).tobaccos;
      case ReferenceEntityType.TobaccoTags:
        return (await this.getReferencesSnapshot()).tobaccoTags;
      case ReferenceEntityType.Hookahs:
        return (await this.getReferencesSnapshot()).hookahs;
      case ReferenceEntityType.Bowls:
        return (await this.getReferencesSnapshot()).bowls;
      case ReferenceEntityType.Kalauds:
        return (await this.getReferencesSnapshot()).kalauds;
      case ReferenceEntityType.Charcoals:
        return (await this.getReferencesSnapshot()).charcoals;
      case ReferenceEntityType.ElectricHeads:
        return (await this.getReferencesSnapshot()).electricHeads;
      default:
        throw new BadRequestException('Unsupported export resource');
    }
  }

  async importResource(
    resource:
      | 'users'
      | 'orders'
      | 'backup'
      | 'backup_audit'
      | ReferenceEntityType,
    payload: unknown,
  ): Promise<ImportSummary> {
    switch (resource) {
      case 'users':
        return this.importUsers(payload);
      case 'orders':
        return this.importOrders(payload);
      case 'backup':
        return this.importBackup(payload);
      case 'backup_audit':
        throw new BadRequestException('Backup audit log is read-only');
      case ReferenceEntityType.Tobaccos:
      case ReferenceEntityType.TobaccoTags:
      case ReferenceEntityType.Hookahs:
      case ReferenceEntityType.Bowls:
      case ReferenceEntityType.Kalauds:
      case ReferenceEntityType.Charcoals:
      case ReferenceEntityType.ElectricHeads:
        return this.importReferences(resource, payload);
      default:
        throw new BadRequestException('Unsupported import resource');
    }
  }

  async exportBackup(): Promise<BackupEnvelope> {
    const [users, references, orders] = await Promise.all([
      this.listStoredUsers(),
      this.getReferencesSnapshot(),
      this.listAllOrders(),
    ]);

    const payload: BackupPayload = {
      users,
      references,
      orders,
    };
    const exportedAt = new Date().toISOString();
    const checksumSha256 = this.computeBackupChecksum(payload);
    const envelope: BackupEnvelope = {
      schemaVersion: 'hookah-backup.v2',
      exportedAt,
      resource: 'backup',
      checksumSha256,
      payload,
    };

    await this.writeBackupAuditEvent({
      resourceName: 'backup',
      actionName: 'export',
      schemaVersion: envelope.schemaVersion,
      checksumSha256,
      itemCount:
        users.length +
        orders.length +
        references.tobaccos.length +
        references.tobaccoTags.length +
        references.hookahs.length +
        references.bowls.length +
        references.kalauds.length +
        references.charcoals.length +
        references.electricHeads.length,
      details: {
        exportedAt,
      },
    });

    return envelope;
  }

  private async createUserRecord(input: CreateUserInput): Promise<AppUser> {
    const normalizedLogin = this.requireString(input.login, 'login');
    const normalizedEmail = this.normalizeOptionalValue(input.email);
    const normalizedTelegram = this.normalizeOptionalValue(
      input.telegramUsername,
    );
    const approvedAt = input.isApproved ? new Date().toISOString() : undefined;
    const userId = randomUUID();

    try {
      await this.databaseService.query(
        `
          insert into auth.users (
            id,
            login,
            password_hash,
            role,
            email,
            telegram_username,
            is_approved,
            approved_at,
            approved_by_user_id
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `,
        [
          userId,
          normalizedLogin,
          input.passwordHash,
          input.role,
          normalizedEmail ?? null,
          normalizedTelegram ?? null,
          input.isApproved,
          approvedAt ?? null,
          input.approvedByUserId ?? null,
        ],
      );
    } catch (error) {
      this.handleConstraintError(error);
    }

    const user = await this.findPublicUserById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  private async createTobacco(
    payload: UpsertReferencePayload,
  ): Promise<TobaccoReference> {
    const brandName = this.requireString(payload.brand, 'brand');
    const lineName = this.requireString(payload.line, 'line');
    const flavorName = this.requireString(payload.flavorName, 'flavorName');
    const lineStrengthLevel = this.requireScaleValue(
      payload.lineStrengthLevel,
      'lineStrengthLevel',
    );

    const lineId = await this.ensureBrandAndLine(
      brandName,
      lineName,
      lineStrengthLevel,
    );

    const tobaccoId = randomUUID();
    const tagIds = await this.resolveTobaccoTagIds(payload.flavorTags);

    await this.databaseService.withTransaction(async (transaction) => {
      await transaction.query(
        `
          insert into catalog.tobaccos (
            id,
            line_id,
            code,
            name,
            flavor_profile,
            flavor_description,
            estimated_strength_level,
            brightness_level,
            in_stock,
            is_active
          )
          values ($1, $2, $3, $4, '{}'::text[], $5, $6, $7, $8, $9)
        `,
        [
          tobaccoId,
          lineId,
          this.buildStableCode(
            'tobacco',
            `${brandName}:${lineName}:${flavorName}`,
          ),
          flavorName,
          this.requireString(payload.flavorDescription, 'flavorDescription'),
          this.requireScaleValue(
            payload.estimatedStrengthLevel,
            'estimatedStrengthLevel',
          ),
          this.requireScaleValue(payload.brightnessLevel, 'brightnessLevel'),
          payload.inStock ?? true,
          payload.isActive ?? true,
        ],
      );

      await this.replaceTobaccoTags(transaction, tobaccoId, tagIds);
    });

    return this.findTobaccoById(tobaccoId);
  }

  private async updateTobacco(
    id: string,
    payload: UpsertReferencePayload,
  ): Promise<TobaccoReference> {
    const existing = await this.findTobaccoById(id);
    const brandName =
      payload.brand !== undefined
        ? this.requireString(payload.brand, 'brand')
        : existing.brand;
    const lineName =
      payload.line !== undefined
        ? this.requireString(payload.line, 'line')
        : existing.line;
    const flavorName =
      payload.flavorName !== undefined
        ? this.requireString(payload.flavorName, 'flavorName')
        : existing.flavorName;
    const lineStrengthLevel =
      payload.lineStrengthLevel !== undefined
        ? this.requireScaleValue(payload.lineStrengthLevel, 'lineStrengthLevel')
        : existing.lineStrengthLevel;

    const lineId = await this.ensureBrandAndLine(
      brandName,
      lineName,
      lineStrengthLevel,
    );
    const tagIds =
      payload.flavorTags !== undefined
        ? await this.resolveTobaccoTagIds(payload.flavorTags)
        : existing.flavorTags.map((tag) => tag.id);

    await this.databaseService.withTransaction(async (transaction) => {
      await transaction.query(
        `
          update catalog.tobaccos
          set
            line_id = $2,
            code = $3,
            name = $4,
            flavor_description = $5,
            estimated_strength_level = $6,
            brightness_level = $7,
            in_stock = $8,
            is_active = $9
          where id = $1
        `,
        [
          id,
          lineId,
          this.buildStableCode(
            'tobacco',
            `${brandName}:${lineName}:${flavorName}`,
          ),
          flavorName,
          payload.flavorDescription !== undefined
            ? this.requireString(payload.flavorDescription, 'flavorDescription')
            : existing.flavorDescription,
          payload.estimatedStrengthLevel !== undefined
            ? this.requireScaleValue(
                payload.estimatedStrengthLevel,
                'estimatedStrengthLevel',
              )
            : existing.estimatedStrengthLevel,
          payload.brightnessLevel !== undefined
            ? this.requireScaleValue(payload.brightnessLevel, 'brightnessLevel')
            : existing.brightnessLevel,
          payload.inStock ?? existing.inStock,
          payload.isActive ?? existing.isActive,
        ],
      );

      await this.replaceTobaccoTags(transaction, id, tagIds);
    });

    return this.findTobaccoById(id);
  }

  private async createTobaccoTag(
    payload: UpsertReferencePayload,
  ): Promise<TobaccoTagReference> {
    const tagId = randomUUID();
    const tagName = this.requireString(payload.name, 'name');

    await this.databaseService.query(
      `
        insert into catalog.tobacco_tags (id, code, name, is_active)
        values ($1, $2, $3, $4)
      `,
      [
        tagId,
        this.buildStableCode('tobacco-tag', tagName),
        tagName,
        payload.isActive ?? true,
      ],
    );

    return this.findTobaccoTagById(tagId);
  }

  private async updateTobaccoTag(
    id: string,
    payload: UpsertReferencePayload,
  ): Promise<TobaccoTagReference> {
    const existing = await this.findTobaccoTagById(id);
    const name =
      payload.name !== undefined
        ? this.requireString(payload.name, 'name')
        : existing.name;

    await this.databaseService.query(
      `
        update catalog.tobacco_tags
        set code = $2, name = $3, is_active = $4, updated_at = now()
        where id = $1
      `,
      [
        id,
        this.buildStableCode('tobacco-tag', name),
        name,
        payload.isActive ?? existing.isActive,
      ],
    );

    return this.findTobaccoTagById(id);
  }

  private async createHookah(
    payload: UpsertReferencePayload,
  ): Promise<HookahReference> {
    const manufacturerId = await this.ensureManufacturer(
      this.requireString(payload.manufacturer, 'manufacturer'),
    );
    const hookahId = randomUUID();

    await this.databaseService.query(
      `
        insert into equipment.hookahs (
          id,
          manufacturer_id,
          name,
          inner_diameter_mm,
          has_diffuser
        )
        values ($1, $2, $3, $4, $5)
      `,
      [
        hookahId,
        manufacturerId,
        this.requireString(payload.name, 'name'),
        this.requirePositiveNumber(payload.innerDiameterMm, 'innerDiameterMm'),
        payload.hasDiffuser ?? false,
      ],
    );

    return this.findHookahById(hookahId);
  }

  private async updateHookah(
    id: string,
    payload: UpsertReferencePayload,
  ): Promise<HookahReference> {
    const existing = await this.findHookahById(id);
    const manufacturerId =
      payload.manufacturer !== undefined
        ? await this.ensureManufacturer(
            this.requireString(payload.manufacturer, 'manufacturer'),
          )
        : await this.ensureManufacturer(existing.manufacturer);

    await this.databaseService.query(
      `
        update equipment.hookahs
        set
          manufacturer_id = $2,
          name = $3,
          inner_diameter_mm = $4,
          has_diffuser = $5
        where id = $1
      `,
      [
        id,
        manufacturerId,
        payload.name !== undefined
          ? this.requireString(payload.name, 'name')
          : existing.name,
        payload.innerDiameterMm !== undefined
          ? this.requirePositiveNumber(
              payload.innerDiameterMm,
              'innerDiameterMm',
            )
          : existing.innerDiameterMm,
        payload.hasDiffuser ?? existing.hasDiffuser,
      ],
    );

    return this.findHookahById(id);
  }

  private async createBowl(
    payload: UpsertReferencePayload,
  ): Promise<BowlReference> {
    const manufacturerId = await this.ensureManufacturer(
      this.requireString(payload.manufacturer, 'manufacturer'),
    );
    const bowlId = randomUUID();

    await this.databaseService.query(
      `
        insert into equipment.bowls (
          id,
          manufacturer_id,
          name,
          bowl_type,
          material,
          capacity_bucket
        )
        values ($1, $2, $3, $4, $5, $6)
      `,
      [
        bowlId,
        manufacturerId,
        this.requireString(payload.name, 'name'),
        this.requireBowlType(payload.bowlType),
        this.normalizeOptionalValue(payload.material) ?? null,
        this.requireCapacityBucket(payload.capacityBucket),
      ],
    );

    return this.findBowlById(bowlId);
  }

  private async updateBowl(
    id: string,
    payload: UpsertReferencePayload,
  ): Promise<BowlReference> {
    const existing = await this.findBowlById(id);
    const manufacturerId =
      payload.manufacturer !== undefined
        ? await this.ensureManufacturer(
            this.requireString(payload.manufacturer, 'manufacturer'),
          )
        : await this.ensureManufacturer(existing.manufacturer);

    await this.databaseService.query(
      `
        update equipment.bowls
        set
          manufacturer_id = $2,
          name = $3,
          bowl_type = $4,
          material = $5,
          capacity_bucket = $6
        where id = $1
      `,
      [
        id,
        manufacturerId,
        payload.name !== undefined
          ? this.requireString(payload.name, 'name')
          : existing.name,
        payload.bowlType !== undefined
          ? this.requireBowlType(payload.bowlType)
          : existing.bowlType,
        payload.material !== undefined
          ? (this.normalizeOptionalValue(payload.material) ?? null)
          : (existing.material ?? null),
        payload.capacityBucket !== undefined
          ? this.requireCapacityBucket(payload.capacityBucket)
          : existing.capacityBucket,
      ],
    );

    return this.findBowlById(id);
  }

  private async createKalaud(
    payload: UpsertReferencePayload,
  ): Promise<KalaudReference> {
    const manufacturerId = await this.ensureManufacturer(
      this.requireString(payload.manufacturer, 'manufacturer'),
    );
    const kalaudId = randomUUID();

    await this.databaseService.query(
      `
        insert into equipment.kalauds (
          id,
          manufacturer_id,
          name,
          material,
          color
        )
        values ($1, $2, $3, $4, $5)
      `,
      [
        kalaudId,
        manufacturerId,
        this.requireString(payload.name, 'name'),
        this.normalizeOptionalValue(payload.material) ?? null,
        this.normalizeOptionalValue(payload.color) ?? null,
      ],
    );

    return this.findKalaudById(kalaudId);
  }

  private async updateKalaud(
    id: string,
    payload: UpsertReferencePayload,
  ): Promise<KalaudReference> {
    const existing = await this.findKalaudById(id);
    const manufacturerId =
      payload.manufacturer !== undefined
        ? await this.ensureManufacturer(
            this.requireString(payload.manufacturer, 'manufacturer'),
          )
        : await this.ensureManufacturer(existing.manufacturer);

    await this.databaseService.query(
      `
        update equipment.kalauds
        set
          manufacturer_id = $2,
          name = $3,
          material = $4,
          color = $5
        where id = $1
      `,
      [
        id,
        manufacturerId,
        payload.name !== undefined
          ? this.requireString(payload.name, 'name')
          : existing.name,
        payload.material !== undefined
          ? (this.normalizeOptionalValue(payload.material) ?? null)
          : (existing.material ?? null),
        payload.color !== undefined
          ? (this.normalizeOptionalValue(payload.color) ?? null)
          : (existing.color ?? null),
      ],
    );

    return this.findKalaudById(id);
  }

  private async createCharcoal(
    payload: UpsertReferencePayload,
  ): Promise<CharcoalReference> {
    const manufacturerId = await this.ensureManufacturer(
      this.requireString(payload.manufacturer, 'manufacturer'),
    );
    const charcoalId = randomUUID();

    await this.databaseService.query(
      `
        insert into equipment.charcoals (
          id,
          manufacturer_id,
          name,
          size_label
        )
        values ($1, $2, $3, $4)
      `,
      [
        charcoalId,
        manufacturerId,
        this.requireString(payload.name, 'name'),
        this.requireString(payload.sizeLabel, 'sizeLabel'),
      ],
    );

    return this.findCharcoalById(charcoalId);
  }

  private async updateCharcoal(
    id: string,
    payload: UpsertReferencePayload,
  ): Promise<CharcoalReference> {
    const existing = await this.findCharcoalById(id);
    const manufacturerId =
      payload.manufacturer !== undefined
        ? await this.ensureManufacturer(
            this.requireString(payload.manufacturer, 'manufacturer'),
          )
        : await this.ensureManufacturer(existing.manufacturer);

    await this.databaseService.query(
      `
        update equipment.charcoals
        set
          manufacturer_id = $2,
          name = $3,
          size_label = $4
        where id = $1
      `,
      [
        id,
        manufacturerId,
        payload.name !== undefined
          ? this.requireString(payload.name, 'name')
          : existing.name,
        payload.sizeLabel !== undefined
          ? this.requireString(payload.sizeLabel, 'sizeLabel')
          : existing.sizeLabel,
      ],
    );

    return this.findCharcoalById(id);
  }

  private async createElectricHead(
    payload: UpsertReferencePayload,
  ): Promise<ElectricHeadReference> {
    const manufacturerId = await this.ensureManufacturer(
      this.requireString(payload.manufacturer, 'manufacturer'),
    );
    const electricHeadId = randomUUID();

    await this.databaseService.query(
      `
        insert into equipment.electric_heads (
          id,
          manufacturer_id,
          name
        )
        values ($1, $2, $3)
      `,
      [
        electricHeadId,
        manufacturerId,
        this.requireString(payload.name, 'name'),
      ],
    );

    return this.findElectricHeadById(electricHeadId);
  }

  private async updateElectricHead(
    id: string,
    payload: UpsertReferencePayload,
  ): Promise<ElectricHeadReference> {
    const existing = await this.findElectricHeadById(id);
    const manufacturerId =
      payload.manufacturer !== undefined
        ? await this.ensureManufacturer(
            this.requireString(payload.manufacturer, 'manufacturer'),
          )
        : await this.ensureManufacturer(existing.manufacturer);

    await this.databaseService.query(
      `
        update equipment.electric_heads
        set
          manufacturer_id = $2,
          name = $3
        where id = $1
      `,
      [
        id,
        manufacturerId,
        payload.name !== undefined
          ? this.requireString(payload.name, 'name')
          : existing.name,
      ],
    );

    return this.findElectricHeadById(id);
  }

  private async listStoredUsers(): Promise<StoredUser[]> {
    const result = await this.databaseService.query(
      `${this.userSelectSql()} order by user_account.created_at desc`,
    );

    return result.rows.map((row) => this.mapStoredUser(row));
  }

  private async listAllOrders(): Promise<OrderView[]> {
    const result = await this.databaseService.query(
      `select id::text as id from sales.orders`,
    );

    return this.loadOrders(result.rows.map((row) => row.id as string));
  }

  async listBackupAuditEvents(): Promise<BackupAuditEvent[]> {
    const result = await this.databaseService.query(
      `
        select
          audit.id::text as id,
          audit.resource_name,
          audit.action_name,
          audit.schema_version,
          audit.checksum_sha256,
          audit.item_count,
          audit.details,
          audit.created_at,
          actor.id::text as actor_id,
          actor.login as actor_login
        from support.backup_audit_events audit
        left join auth.users actor on actor.id = audit.actor_user_id
        order by audit.created_at desc
        limit 100
      `,
    );

    return result.rows.map((row) => ({
      id: row.id as string,
      actor: row.actor_id
        ? {
            id: row.actor_id as string,
            login: row.actor_login as string,
          }
        : undefined,
      resourceName: row.resource_name as string,
      actionName: row.action_name as string,
      schemaVersion: row.schema_version as string,
      checksumSha256: row.checksum_sha256 as string,
      itemCount: Number(row.item_count),
      details: (row.details as Record<string, unknown> | null) ?? {},
      createdAt: this.toIsoString(row.created_at),
    }));
  }

  private async loadOrders(orderIds: string[]): Promise<OrderView[]> {
    if (orderIds.length === 0) {
      return [];
    }

    const orderResult = await this.databaseService.query(
      `
        select
          sales_order.id::text as id,
          sales_order.table_label,
          sales_order.status::text as status,
          sales_order.created_at,
          sales_order.updated_at,
          sales_order.delivered_at,
          sales_order.feedback_at,
          sales_order.packing_comment,
          sales_order.requested_heating_system_type::text as requested_heating_system_type,
          sales_order.requested_packing_style::text as requested_packing_style,
          sales_order.requested_custom_packing_style,
          sales_order.requested_hookah_id::text as requested_hookah_id,
          sales_order.requested_bowl_id::text as requested_bowl_id,
          sales_order.requested_kalaud_id::text as requested_kalaud_id,
          sales_order.requested_charcoal_id::text as requested_charcoal_id,
          sales_order.requested_electric_head_id::text as requested_electric_head_id,
          sales_order.requested_charcoal_count,
          sales_order.requested_warmup_mode::text as requested_warmup_mode,
          sales_order.requested_warmup_duration_minutes,
          sales_order.actual_heating_system_type::text as actual_heating_system_type,
          sales_order.actual_packing_style::text as actual_packing_style,
          sales_order.actual_custom_packing_style,
          sales_order.actual_hookah_id::text as actual_hookah_id,
          sales_order.actual_bowl_id::text as actual_bowl_id,
          sales_order.actual_kalaud_id::text as actual_kalaud_id,
          sales_order.actual_charcoal_id::text as actual_charcoal_id,
          sales_order.actual_electric_head_id::text as actual_electric_head_id,
          sales_order.actual_charcoal_count,
          sales_order.actual_warmup_mode::text as actual_warmup_mode,
          sales_order.actual_warmup_duration_minutes,
          accepted_user.id::text as accepted_by_id,
          accepted_user.login as accepted_by_login,
          accepted_user.role::text as accepted_by_role,
          accepted_user.email as accepted_by_email,
          accepted_user.telegram_username as accepted_by_telegram_username,
          accepted_user.is_approved as accepted_by_is_approved,
          accepted_user.approved_at as accepted_by_approved_at,
          accepted_user.created_at as accepted_by_created_at,
          accepted_user.updated_at as accepted_by_updated_at,
          accepted_approver.id::text as accepted_by_approved_by_id,
          accepted_approver.login as accepted_by_approved_by_login
        from sales.orders sales_order
        left join auth.users accepted_user
          on accepted_user.id = sales_order.accepted_by_user_id
        left join auth.users accepted_approver
          on accepted_approver.id = accepted_user.approved_by_user_id
        where sales_order.id = any($1::uuid[])
        order by sales_order.created_at desc
      `,
      [orderIds],
    );

    const participantResult = await this.databaseService.query(
      `
        select
          participant.id::text as id,
          participant.order_id::text as order_id,
          participant.description,
          participant.wants_cooling,
          participant.wants_mint,
          participant.wants_spicy,
          participant.joined_at,
          participant.table_approval_status::text as table_approval_status,
          participant.table_approved_at,
          approved_user.id::text as table_approved_by_id,
          approved_user.login as table_approved_by_login,
          client_user.id::text as client_id,
          client_user.login as client_login,
          client_user.role::text as client_role,
          client_user.email as client_email,
          client_user.telegram_username as client_telegram_username,
          client_user.is_approved as client_is_approved,
          client_user.approved_at as client_approved_at,
          client_user.created_at as client_created_at,
          client_user.updated_at as client_updated_at,
          client_approver.id::text as client_approved_by_id,
          client_approver.login as client_approved_by_login
        from sales.order_participants participant
        join auth.users client_user on client_user.id = participant.client_user_id
        left join auth.users client_approver
          on client_approver.id = client_user.approved_by_user_id
        left join auth.users approved_user
          on approved_user.id = participant.table_approved_by_user_id
        where participant.order_id = any($1::uuid[])
        order by participant.joined_at asc
      `,
      [orderIds],
    );

    const participantIds = participantResult.rows.map(
      (row) => row.id as string,
    );
    const [references, requestedBlendByParticipant, actualBlendByOrder] =
      await Promise.all([
        this.getReferencesSnapshot(),
        this.loadParticipantTobaccos(participantIds),
        this.loadActualTobaccos(orderIds),
      ]);
    const feedbacksByParticipant = await this.loadFeedbacks(orderIds);
    const timelineByOrder = await this.loadTimeline(orderIds);

    const participantsByOrder = new Map<string, OrderParticipantView[]>();

    participantResult.rows.forEach((row) => {
      const participants =
        participantsByOrder.get(row.order_id as string) ?? [];
      const client = this.mapPublicUserFromAlias(row, 'client');

      participants.push({
        client,
        description: row.description as string,
        joinedAt: this.toIsoString(row.joined_at),
        wantsCooling: Boolean(row.wants_cooling),
        wantsMint: Boolean(row.wants_mint),
        wantsSpicy: Boolean(row.wants_spicy),
        requestedBlend: requestedBlendByParticipant.get(row.id as string) ?? [],
        requestedTobaccos: (
          requestedBlendByParticipant.get(row.id as string) ?? []
        ).map((entry) => entry.tobacco),
        tableApprovalStatus: row.table_approval_status as TableApprovalStatus,
        tableApprovedAt: this.toOptionalIsoString(row.table_approved_at),
        tableApprovedBy: row.table_approved_by_id
          ? {
              id: row.table_approved_by_id as string,
              login: row.table_approved_by_login as string,
            }
          : undefined,
        feedback: feedbacksByParticipant.get(row.id as string),
      });
      participantsByOrder.set(row.order_id as string, participants);
    });

    return orderResult.rows.map((row) => {
      const participants = participantsByOrder.get(row.id as string) ?? [];
      const feedbacks = participants
        .map((participant) => participant.feedback)
        .filter((entry): entry is OrderFeedbackView => Boolean(entry));

      return {
        id: row.id as string,
        tableLabel: (row.table_label as string) ?? 'Стол без номера',
        status: row.status as OrderStatus,
        createdAt: this.toIsoString(row.created_at),
        updatedAt: this.toIsoString(row.updated_at),
        deliveredAt: this.toOptionalIsoString(row.delivered_at),
        feedbackAt: this.toOptionalIsoString(row.feedback_at),
        acceptedBy: row.accepted_by_id
          ? this.mapPublicUserFromAlias(row, 'accepted_by')
          : undefined,
        requestedSetup: this.resolveOrderSetupView(
          row,
          'requested',
          references,
        ),
        actualSetup: this.resolveOrderSetupView(row, 'actual', references),
        participants,
        requestedBlend: this.deduplicateBlendComponents(
          participants.flatMap((participant) => participant.requestedBlend),
        ),
        requestedTobaccos: this.deduplicateTobaccos(
          participants.flatMap((participant) => participant.requestedTobaccos),
        ),
        actualBlend: actualBlendByOrder.get(row.id as string) ?? [],
        actualTobaccos: (actualBlendByOrder.get(row.id as string) ?? []).map(
          (entry) => entry.tobacco,
        ),
        packingComment: (row.packing_comment as string | null) ?? undefined,
        feedbacks,
        timeline: timelineByOrder.get(row.id as string) ?? [],
      } satisfies OrderView;
    });
  }

  private async loadParticipantTobaccos(
    participantIds: string[],
  ): Promise<Map<string, OrderBlendComponentView[]>> {
    if (participantIds.length === 0) {
      return new Map();
    }

    const result = await this.databaseService.query(
      `
        select
          participant_tobacco.participant_id::text as participant_id,
          participant_tobacco.percentage,
          ${this.tobaccoProjectionSql()}
        from sales.order_participant_tobaccos participant_tobacco
        join catalog.tobaccos tobacco on tobacco.id = participant_tobacco.tobacco_id
        join catalog.product_lines product_line on product_line.id = tobacco.line_id
        join catalog.brands brand on brand.id = product_line.brand_id
        where participant_tobacco.participant_id = any($1::uuid[])
      `,
      [participantIds],
    );

    const map = new Map<string, OrderBlendComponentView[]>();

    result.rows.forEach((row) => {
      const entries = map.get(row.participant_id as string) ?? [];
      entries.push(this.mapBlendRow(row));
      map.set(row.participant_id as string, entries);
    });

    return map;
  }

  private async loadActualTobaccos(
    orderIds: string[],
  ): Promise<Map<string, OrderBlendComponentView[]>> {
    const result = await this.databaseService.query(
      `
        select
          actual_tobacco.order_id::text as order_id,
          actual_tobacco.percentage,
          ${this.tobaccoProjectionSql()}
        from sales.order_actual_tobaccos actual_tobacco
        join catalog.tobaccos tobacco on tobacco.id = actual_tobacco.tobacco_id
        join catalog.product_lines product_line on product_line.id = tobacco.line_id
        join catalog.brands brand on brand.id = product_line.brand_id
        where actual_tobacco.order_id = any($1::uuid[])
      `,
      [orderIds],
    );
    const map = new Map<string, OrderBlendComponentView[]>();

    result.rows.forEach((row) => {
      const entries = map.get(row.order_id as string) ?? [];
      entries.push(this.mapBlendRow(row));
      map.set(row.order_id as string, entries);
    });

    return map;
  }

  private async loadFeedbacks(
    orderIds: string[],
  ): Promise<Map<string, OrderFeedbackView>> {
    const result = await this.databaseService.query(
      `
        select
          feedback.participant_id::text as participant_id,
          feedback.rating_score,
          feedback.rating_review,
          feedback.submitted_at,
          client_user.id::text as client_id,
          client_user.login as client_login,
          client_user.role::text as client_role,
          client_user.email as client_email,
          client_user.telegram_username as client_telegram_username,
          client_user.is_approved as client_is_approved,
          client_user.approved_at as client_approved_at,
          client_user.created_at as client_created_at,
          client_user.updated_at as client_updated_at,
          client_approver.id::text as client_approved_by_id,
          client_approver.login as client_approved_by_login
        from sales.order_feedbacks feedback
        join sales.order_participants participant on participant.id = feedback.participant_id
        join auth.users client_user on client_user.id = participant.client_user_id
        left join auth.users client_approver on client_approver.id = client_user.approved_by_user_id
        where feedback.order_id = any($1::uuid[])
      `,
      [orderIds],
    );
    const map = new Map<string, OrderFeedbackView>();

    result.rows.forEach((row) => {
      map.set(row.participant_id as string, {
        client: this.mapPublicUserFromAlias(row, 'client'),
        ratingScore: Number(row.rating_score),
        ratingReview: (row.rating_review as string | null) ?? undefined,
        submittedAt: this.toIsoString(row.submitted_at),
      });
    });

    return map;
  }

  private async loadTimeline(
    orderIds: string[],
  ): Promise<Map<string, OrderTimelineEntryView[]>> {
    const result = await this.databaseService.query(
      `
        select
          timeline.id::text as id,
          timeline.order_id::text as order_id,
          timeline.event_type::text as event_type,
          timeline.status::text as status,
          timeline.note,
          timeline.occurred_at,
          actor_user.id::text as actor_id,
          actor_user.login as actor_login,
          actor_user.role::text as actor_role,
          actor_user.email as actor_email,
          actor_user.telegram_username as actor_telegram_username,
          actor_user.is_approved as actor_is_approved,
          actor_user.approved_at as actor_approved_at,
          actor_user.created_at as actor_created_at,
          actor_user.updated_at as actor_updated_at,
          actor_approver.id::text as actor_approved_by_id,
          actor_approver.login as actor_approved_by_login
        from sales.order_timeline timeline
        left join auth.users actor_user on actor_user.id = timeline.actor_user_id
        left join auth.users actor_approver on actor_approver.id = actor_user.approved_by_user_id
        where timeline.order_id = any($1::uuid[])
        order by timeline.occurred_at desc
      `,
      [orderIds],
    );
    const map = new Map<string, OrderTimelineEntryView[]>();

    result.rows.forEach((row) => {
      const entries = map.get(row.order_id as string) ?? [];
      entries.push({
        id: row.id as string,
        type: row.event_type as OrderTimelineEventType,
        status: row.status as OrderStatus,
        occurredAt: this.toIsoString(row.occurred_at),
        actor: row.actor_id
          ? this.mapPublicUserFromAlias(row, 'actor')
          : undefined,
        note: row.note as string,
      });
      map.set(row.order_id as string, entries);
    });

    return map;
  }

  private async listTobaccos(): Promise<TobaccoReference[]> {
    const result = await this.databaseService.query(
      `
        select ${this.tobaccoProjectionSql()}
        from catalog.tobaccos tobacco
        join catalog.product_lines product_line on product_line.id = tobacco.line_id
        join catalog.brands brand on brand.id = product_line.brand_id
        order by brand.name asc, product_line.name asc, tobacco.name asc
      `,
    );

    return result.rows.map((row) => this.mapTobacco(row));
  }

  private async listTobaccoTags(): Promise<TobaccoTagReference[]> {
    const result = await this.databaseService.query(
      `
        select id::text as id, name, is_active
        from catalog.tobacco_tags
        order by name asc
      `,
    );

    return result.rows.map((row) => ({
      id: row.id as string,
      name: row.name as string,
      isActive: Boolean(row.is_active),
    }));
  }

  private async listHookahs(): Promise<HookahReference[]> {
    const result = await this.databaseService.query(
      `
        select
          hookah.id::text as id,
          manufacturer.name as manufacturer,
          hookah.name,
          hookah.inner_diameter_mm,
          hookah.has_diffuser
        from equipment.hookahs hookah
        join equipment.manufacturers manufacturer on manufacturer.id = hookah.manufacturer_id
        order by manufacturer.name asc, hookah.name asc
      `,
    );

    return result.rows.map((row) => ({
      id: row.id as string,
      manufacturer: row.manufacturer as string,
      name: row.name as string,
      innerDiameterMm: Number(row.inner_diameter_mm),
      hasDiffuser: Boolean(row.has_diffuser),
      isActive: true,
    }));
  }

  private async listBowls(): Promise<BowlReference[]> {
    const result = await this.databaseService.query(
      `
        select
          bowl.id::text as id,
          manufacturer.name as manufacturer,
          bowl.name,
          bowl.bowl_type::text as bowl_type,
          bowl.material,
          bowl.capacity_bucket::text as capacity_bucket
        from equipment.bowls bowl
        join equipment.manufacturers manufacturer on manufacturer.id = bowl.manufacturer_id
        order by manufacturer.name asc, bowl.name asc
      `,
    );

    return result.rows.map((row) => ({
      id: row.id as string,
      manufacturer: row.manufacturer as string,
      name: row.name as string,
      bowlType: row.bowl_type as BowlReference['bowlType'],
      material: (row.material as string | null) ?? undefined,
      capacityBucket: row.capacity_bucket as BowlReference['capacityBucket'],
      isActive: true,
    }));
  }

  private async listKalauds(): Promise<KalaudReference[]> {
    const result = await this.databaseService.query(
      `
        select
          kalaud.id::text as id,
          manufacturer.name as manufacturer,
          kalaud.name,
          kalaud.material,
          kalaud.color
        from equipment.kalauds kalaud
        join equipment.manufacturers manufacturer on manufacturer.id = kalaud.manufacturer_id
        order by manufacturer.name asc, kalaud.name asc
      `,
    );

    return result.rows.map((row) => ({
      id: row.id as string,
      manufacturer: row.manufacturer as string,
      name: row.name as string,
      material: (row.material as string | null) ?? undefined,
      color: (row.color as string | null) ?? undefined,
      isActive: true,
    }));
  }

  private async listCharcoals(): Promise<CharcoalReference[]> {
    const result = await this.databaseService.query(
      `
        select
          charcoal.id::text as id,
          manufacturer.name as manufacturer,
          charcoal.name,
          charcoal.size_label
        from equipment.charcoals charcoal
        join equipment.manufacturers manufacturer on manufacturer.id = charcoal.manufacturer_id
        order by manufacturer.name asc, charcoal.name asc
      `,
    );

    return result.rows.map((row) => ({
      id: row.id as string,
      manufacturer: row.manufacturer as string,
      name: row.name as string,
      sizeLabel: row.size_label as string,
      isActive: true,
    }));
  }

  private async listElectricHeads(): Promise<ElectricHeadReference[]> {
    const result = await this.databaseService.query(
      `
        select
          electric_head.id::text as id,
          manufacturer.name as manufacturer,
          electric_head.name
        from equipment.electric_heads electric_head
        join equipment.manufacturers manufacturer
          on manufacturer.id = electric_head.manufacturer_id
        order by manufacturer.name asc, electric_head.name asc
      `,
    );

    return result.rows.map((row) => ({
      id: row.id as string,
      manufacturer: row.manufacturer as string,
      name: row.name as string,
      isActive: true,
    }));
  }

  private async findTobaccoById(id: string): Promise<TobaccoReference> {
    const tobacco = (await this.listTobaccos()).find((item) => item.id === id);

    if (!tobacco) {
      throw new NotFoundException('Tobacco not found');
    }

    return tobacco;
  }

  private async findHookahById(id: string): Promise<HookahReference> {
    const hookah = (await this.listHookahs()).find((item) => item.id === id);

    if (!hookah) {
      throw new NotFoundException('Hookah not found');
    }

    return hookah;
  }

  private async findBowlById(id: string): Promise<BowlReference> {
    const bowl = (await this.listBowls()).find((item) => item.id === id);

    if (!bowl) {
      throw new NotFoundException('Bowl not found');
    }

    return bowl;
  }

  private async findKalaudById(id: string): Promise<KalaudReference> {
    const kalaud = (await this.listKalauds()).find((item) => item.id === id);

    if (!kalaud) {
      throw new NotFoundException('Kalaud not found');
    }

    return kalaud;
  }

  private async findCharcoalById(id: string): Promise<CharcoalReference> {
    const charcoal = (await this.listCharcoals()).find(
      (item) => item.id === id,
    );

    if (!charcoal) {
      throw new NotFoundException('Charcoal not found');
    }

    return charcoal;
  }

  private async findElectricHeadById(
    id: string,
  ): Promise<ElectricHeadReference> {
    const electricHead = (await this.listElectricHeads()).find(
      (item) => item.id === id,
    );

    if (!electricHead) {
      throw new NotFoundException('Electric head not found');
    }

    return electricHead;
  }

  private async ensureManufacturer(name: string): Promise<string> {
    const manufacturerName = this.requireString(name, 'manufacturer');
    const result = await this.databaseService.query(
      `
        insert into equipment.manufacturers (code, name)
        values ($1, $2)
        on conflict (code) do update
        set name = excluded.name
        returning id::text as id
      `,
      [
        this.buildStableCode('manufacturer', manufacturerName),
        manufacturerName,
      ],
    );

    return result.rows[0]!.id as string;
  }

  private async ensureBrandAndLine(
    brandName: string,
    lineName: string,
    lineStrengthLevel: number,
  ): Promise<string> {
    const brandResult = await this.databaseService.query(
      `
        insert into catalog.brands (code, name)
        values ($1, $2)
        on conflict (code) do update
        set name = excluded.name
        returning id::text as id
      `,
      [this.buildStableCode('brand', brandName), brandName],
    );
    const brandId = brandResult.rows[0]!.id as string;
    const lineResult = await this.databaseService.query(
      `
        insert into catalog.product_lines (brand_id, code, name, strength_level)
        values ($1, $2, $3, $4)
        on conflict (brand_id, code) do update
        set
          name = excluded.name,
          strength_level = excluded.strength_level
        returning id::text as id
      `,
      [
        brandId,
        this.buildStableCode('line', `${brandName}:${lineName}`),
        lineName,
        lineStrengthLevel,
      ],
    );

    return lineResult.rows[0]!.id as string;
  }

  private async resolveTobaccoTagIds(
    input: string[] | string | undefined,
  ): Promise<string[]> {
    if (input === undefined) {
      return [];
    }

    const tagNames = Array.isArray(input)
      ? input
      : input
          .split(',')
          .map((item) => item.trim())
          .filter((item) => item.length > 0);

    if (tagNames.length === 0) {
      return [];
    }

    const result = await this.databaseService.query(
      `
        select id::text as id, name
        from catalog.tobacco_tags
        where lower(name) = any($1::text[])
      `,
      [tagNames.map((item) => item.toLowerCase())],
    );

    if (
      (result.rowCount ?? 0) !==
      new Set(tagNames.map((item) => item.toLowerCase())).size
    ) {
      throw new BadRequestException('Unknown tobacco tag in flavorTags');
    }

    return result.rows.map((row) => row.id as string);
  }

  private async replaceTobaccoTags(
    transaction: Queryable,
    tobaccoId: string,
    tagIds: string[],
  ): Promise<void> {
    await transaction.query(
      `delete from catalog.tobacco_tag_links where tobacco_id = $1`,
      [tobaccoId],
    );

    for (const tagId of tagIds) {
      await transaction.query(
        `
          insert into catalog.tobacco_tag_links (tobacco_id, tag_id)
          values ($1, $2)
        `,
        [tobaccoId, tagId],
      );
    }
  }

  private async insertParticipantTobaccos(
    transaction: Queryable,
    participantId: string,
    blend: Array<{ tobaccoId: string; percentage: number }>,
  ): Promise<void> {
    for (const component of blend) {
      await transaction.query(
        `
          insert into sales.order_participant_tobaccos (
            participant_id,
            tobacco_id,
            percentage
          )
          values ($1, $2, $3)
        `,
        [participantId, component.tobaccoId, component.percentage],
      );
    }
  }

  private async insertOrderTobaccos(
    transaction: Queryable,
    orderId: string,
    blend: Array<{ tobaccoId: string; percentage: number }>,
  ): Promise<void> {
    for (const component of blend) {
      await transaction.query(
        `
          insert into sales.order_actual_tobaccos (
            order_id,
            tobacco_id,
            percentage
          )
          values ($1, $2, $3)
        `,
        [orderId, component.tobaccoId, component.percentage],
      );
    }
  }

  private async validateBlendSelection(
    blend: Array<{ tobaccoId: string; percentage: number }>,
    label: string,
  ): Promise<Array<{ tobaccoId: string; percentage: number }>> {
    if (!Array.isArray(blend)) {
      throw new BadRequestException(`${label} should be an array`);
    }

    const normalizedBlend = blend.map((component) => ({
      tobaccoId: this.requireString(component.tobaccoId, `${label}.tobaccoId`),
      percentage: this.requirePercentageValue(
        component.percentage,
        `${label}.percentage`,
      ),
    }));
    const uniqueIds = [
      ...new Set(normalizedBlend.map((entry) => entry.tobaccoId)),
    ];

    if (uniqueIds.length === 0 || uniqueIds.length > 3) {
      throw new BadRequestException(
        `${label} should contain from 1 to 3 tobaccos`,
      );
    }

    if (normalizedBlend.length !== uniqueIds.length) {
      throw new BadRequestException(`${label} should not contain duplicates`);
    }

    const totalPercentage = normalizedBlend.reduce(
      (sum, component) => sum + component.percentage,
      0,
    );

    if (Math.abs(totalPercentage - 100) > 0.001) {
      throw new BadRequestException(`${label} should sum to 100 percent`);
    }

    const result = await this.databaseService.query(
      `select count(*)::int as count from catalog.tobaccos where id = any($1::uuid[])`,
      [uniqueIds],
    );

    if (Number(result.rows[0]?.count ?? 0) !== uniqueIds.length) {
      throw new BadRequestException(`Unknown tobacco in ${label}`);
    }

    return normalizedBlend;
  }

  private async getOrderMeta(
    orderId: string,
    transaction: Queryable,
  ): Promise<{
    tableLabel: string;
    status: OrderStatus;
  }> {
    const result = await transaction.query(
      `
        select
          table_label,
          status::text as status
        from sales.orders
        where id = $1
        limit 1
      `,
      [orderId],
    );

    const row = result.rows[0];

    if (!row) {
      throw new NotFoundException('Order not found');
    }

    return {
      tableLabel: (row.table_label as string) ?? 'Стол без номера',
      status: row.status as OrderStatus,
    };
  }

  private async getOrderTableLabel(
    orderId: string,
    transaction: Queryable,
  ): Promise<string> {
    const meta = await this.getOrderMeta(orderId, transaction);

    return meta.tableLabel;
  }

  private async importUsers(payload: unknown): Promise<ImportSummary> {
    const users = this.requireArray<StoredUser>(payload, 'users');

    await this.databaseService.withTransaction(async (transaction) => {
      await transaction.query(`delete from sales.order_feedbacks`);
      await transaction.query(`delete from sales.order_actual_tobaccos`);
      await transaction.query(`delete from sales.order_participant_tobaccos`);
      await transaction.query(`delete from sales.order_timeline`);
      await transaction.query(`delete from sales.order_participants`);
      await transaction.query(`delete from sales.order_items`);
      await transaction.query(`delete from sales.orders`);
      await transaction.query(`delete from auth.users`);

      for (const user of users) {
        await transaction.query(
          `
            insert into auth.users (
              id,
              login,
              password_hash,
              role,
              email,
              telegram_username,
              is_approved,
              approved_at,
              approved_by_user_id,
              created_at,
              updated_at
            )
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          `,
          [
            user.id,
            user.login,
            user.passwordHash,
            user.role,
            user.email ?? null,
            user.telegramUsername ?? null,
            user.isApproved,
            user.approvedAt ?? null,
            user.approvedByUserId ?? null,
            user.createdAt,
            user.updatedAt,
          ],
        );
      }
    });

    return {
      importedCount: users.length,
    };
  }

  private async importReferences(
    resource: ReferenceEntityType,
    payload: unknown,
  ): Promise<ImportSummary> {
    const items = this.requireArray<Record<string, unknown>>(payload, resource);
    let importedCount = 0;

    switch (resource) {
      case ReferenceEntityType.Tobaccos:
        for (const item of items as unknown as TobaccoReference[]) {
          await this.createReference(resource, {
            ...item,
            flavorTags: item.flavorTags.map((tag) => tag.name),
          });
          importedCount += 1;
        }
        break;
      case ReferenceEntityType.TobaccoTags:
        for (const item of items as unknown as TobaccoTagReference[]) {
          await this.createReference(
            resource,
            item as unknown as UpsertReferencePayload,
          );
          importedCount += 1;
        }
        break;
      case ReferenceEntityType.Hookahs:
      case ReferenceEntityType.Bowls:
      case ReferenceEntityType.Kalauds:
      case ReferenceEntityType.Charcoals:
      case ReferenceEntityType.ElectricHeads:
        for (const item of items as unknown as Array<
          | HookahReference
          | BowlReference
          | KalaudReference
          | CharcoalReference
          | ElectricHeadReference
        >) {
          await this.createReference(
            resource,
            item as unknown as UpsertReferencePayload,
          );
          importedCount += 1;
        }
        break;
      default:
        break;
    }

    return { importedCount };
  }

  private async importOrders(payload: unknown): Promise<ImportSummary> {
    const orders = this.requireArray<OrderView>(payload, 'orders');

    await this.databaseService.withTransaction(async (transaction) => {
      await transaction.query(`delete from sales.order_feedbacks`);
      await transaction.query(`delete from sales.order_actual_tobaccos`);
      await transaction.query(`delete from sales.order_participant_tobaccos`);
      await transaction.query(`delete from sales.order_timeline`);
      await transaction.query(`delete from sales.order_participants`);
      await transaction.query(`delete from sales.order_items`);
      await transaction.query(`delete from sales.orders`);

      for (const order of orders) {
        await transaction.query(
          `
            insert into sales.orders (
              id,
              status,
              service_type,
              table_label,
              total_amount,
              created_at,
              updated_at,
              accepted_by_user_id,
              delivered_at,
              feedback_at,
              packing_comment,
              requested_heating_system_type,
              requested_packing_style,
              requested_custom_packing_style,
              requested_hookah_id,
              requested_bowl_id,
              requested_kalaud_id,
              requested_charcoal_id,
              requested_electric_head_id,
              requested_charcoal_count,
              requested_warmup_mode,
              requested_warmup_duration_minutes,
              actual_heating_system_type,
              actual_packing_style,
              actual_custom_packing_style,
              actual_hookah_id,
              actual_bowl_id,
              actual_kalaud_id,
              actual_charcoal_id,
              actual_electric_head_id,
              actual_charcoal_count,
              actual_warmup_mode,
              actual_warmup_duration_minutes
            )
            values (
              $1, $2, 'hookah', $3, 0, $4, $5, $6, $7, $8, $9,
              $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
              $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31
            )
          `,
          [
            order.id,
            order.status,
            order.tableLabel,
            order.createdAt,
            order.updatedAt,
            order.acceptedBy?.id ?? null,
            order.deliveredAt ?? null,
            order.feedbackAt ?? null,
            order.packingComment ?? null,
            order.requestedSetup?.heatingSystemType ?? null,
            order.requestedSetup?.packingStyle ?? null,
            order.requestedSetup?.customPackingStyle ?? null,
            order.requestedSetup?.hookah?.id ?? null,
            order.requestedSetup?.bowl?.id ?? null,
            order.requestedSetup?.kalaud?.id ?? null,
            order.requestedSetup?.charcoal?.id ?? null,
            order.requestedSetup?.electricHead?.id ?? null,
            order.requestedSetup?.charcoalCount ?? null,
            order.requestedSetup?.warmupMode ?? null,
            order.requestedSetup?.warmupDurationMinutes ?? null,
            order.actualSetup?.heatingSystemType ?? null,
            order.actualSetup?.packingStyle ?? null,
            order.actualSetup?.customPackingStyle ?? null,
            order.actualSetup?.hookah?.id ?? null,
            order.actualSetup?.bowl?.id ?? null,
            order.actualSetup?.kalaud?.id ?? null,
            order.actualSetup?.charcoal?.id ?? null,
            order.actualSetup?.electricHead?.id ?? null,
            order.actualSetup?.charcoalCount ?? null,
            order.actualSetup?.warmupMode ?? null,
            order.actualSetup?.warmupDurationMinutes ?? null,
          ],
        );

        for (const component of order.actualBlend) {
          await transaction.query(
            `
              insert into sales.order_actual_tobaccos (order_id, tobacco_id, percentage)
              values ($1, $2, $3)
            `,
            [order.id, component.tobacco.id, component.percentage],
          );
        }

        for (const participant of order.participants) {
          const participantId = randomUUID();

          await transaction.query(
            `
              insert into sales.order_participants (
                id,
                order_id,
                client_user_id,
                description,
                wants_cooling,
                wants_mint,
                wants_spicy,
                joined_at,
                table_approval_status,
                table_approved_at,
                table_approved_by_user_id
              )
              values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            `,
            [
              participantId,
              order.id,
              participant.client.id,
              participant.description,
              participant.wantsCooling,
              participant.wantsMint,
              participant.wantsSpicy,
              participant.joinedAt,
              participant.tableApprovalStatus,
              participant.tableApprovedAt ?? null,
              participant.tableApprovedBy?.id ?? null,
            ],
          );

          for (const component of participant.requestedBlend) {
            await transaction.query(
              `
                insert into sales.order_participant_tobaccos (
                  participant_id,
                  tobacco_id,
                  percentage
                )
                values ($1, $2, $3)
              `,
              [participantId, component.tobacco.id, component.percentage],
            );
          }

          if (participant.feedback) {
            await transaction.query(
              `
                insert into sales.order_feedbacks (
                  id,
                  order_id,
                  participant_id,
                  rating_score,
                  rating_review,
                  submitted_at
                )
                values ($1, $2, $3, $4, $5, $6)
              `,
              [
                randomUUID(),
                order.id,
                participantId,
                participant.feedback.ratingScore,
                participant.feedback.ratingReview ?? null,
                participant.feedback.submittedAt,
              ],
            );
          }
        }

        for (const event of order.timeline) {
          await transaction.query(
            `
              insert into sales.order_timeline (
                id,
                order_id,
                event_type,
                status,
                actor_user_id,
                note,
                occurred_at
              )
              values ($1, $2, $3, $4, $5, $6, $7)
            `,
            [
              event.id,
              order.id,
              event.type,
              event.status,
              event.actor?.id ?? null,
              event.note,
              event.occurredAt,
            ],
          );
        }
      }
    });

    return {
      importedCount: orders.length,
    };
  }

  private async importBackup(payload: unknown): Promise<ImportSummary> {
    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException('Backup payload must be an object');
    }

    const envelope = payload as Partial<BackupEnvelope>;

    if (envelope.schemaVersion !== 'hookah-backup.v2') {
      throw new BadRequestException('Unsupported backup schema version');
    }

    if (envelope.resource !== 'backup' || !envelope.payload) {
      throw new BadRequestException('Backup envelope is invalid');
    }

    const checksumSha256 = this.computeBackupChecksum(envelope.payload);

    if (checksumSha256 !== envelope.checksumSha256) {
      throw new BadRequestException('Backup checksum validation failed');
    }

    const backup = envelope.payload;
    await this.databaseService.withTransaction(async (transaction) => {
      await transaction.query(`delete from sales.order_feedbacks`);
      await transaction.query(`delete from sales.order_actual_tobaccos`);
      await transaction.query(`delete from sales.order_participant_tobaccos`);
      await transaction.query(`delete from sales.order_timeline`);
      await transaction.query(`delete from sales.order_participants`);
      await transaction.query(`delete from sales.order_items`);
      await transaction.query(`delete from sales.orders`);
      await transaction.query(`delete from recipes.packing_tobaccos`);
      await transaction.query(`delete from recipes.packings`);
      await transaction.query(`delete from equipment.charcoals`);
      await transaction.query(`delete from equipment.electric_heads`);
      await transaction.query(`delete from equipment.kalauds`);
      await transaction.query(`delete from equipment.hookahs`);
      await transaction.query(`delete from equipment.bowls`);
      await transaction.query(`delete from equipment.manufacturers`);
      await transaction.query(`delete from catalog.tobacco_tag_links`);
      await transaction.query(`delete from catalog.tobaccos`);
      await transaction.query(`delete from catalog.tobacco_tags`);
      await transaction.query(`delete from catalog.product_lines`);
      await transaction.query(`delete from catalog.brands`);
      await transaction.query(`delete from auth.users`);
    });
    await this.importUsers(backup.users ?? []);
    await this.importReferences(
      ReferenceEntityType.TobaccoTags,
      backup.references?.tobaccoTags ?? [],
    );
    await this.importReferences(
      ReferenceEntityType.Tobaccos,
      backup.references?.tobaccos ?? [],
    );
    await this.importReferences(
      ReferenceEntityType.Hookahs,
      backup.references?.hookahs ?? [],
    );
    await this.importReferences(
      ReferenceEntityType.Bowls,
      backup.references?.bowls ?? [],
    );
    await this.importReferences(
      ReferenceEntityType.Kalauds,
      backup.references?.kalauds ?? [],
    );
    await this.importReferences(
      ReferenceEntityType.Charcoals,
      backup.references?.charcoals ?? [],
    );
    await this.importReferences(
      ReferenceEntityType.ElectricHeads,
      backup.references?.electricHeads ?? [],
    );
    await this.importOrders(backup.orders ?? []);

    await this.writeBackupAuditEvent({
      resourceName: 'backup',
      actionName: 'import',
      schemaVersion: envelope.schemaVersion,
      checksumSha256,
      itemCount:
        (backup.users?.length ?? 0) +
        (backup.orders?.length ?? 0) +
        (backup.references?.tobaccos?.length ?? 0) +
        (backup.references?.tobaccoTags?.length ?? 0) +
        (backup.references?.hookahs?.length ?? 0) +
        (backup.references?.bowls?.length ?? 0) +
        (backup.references?.kalauds?.length ?? 0) +
        (backup.references?.charcoals?.length ?? 0) +
        (backup.references?.electricHeads?.length ?? 0),
      details: {
        importedAt: new Date().toISOString(),
      },
    });

    return {
      importedCount:
        (backup.users?.length ?? 0) +
        (backup.orders?.length ?? 0) +
        (backup.references?.tobaccos?.length ?? 0) +
        (backup.references?.tobaccoTags?.length ?? 0) +
        (backup.references?.hookahs?.length ?? 0) +
        (backup.references?.bowls?.length ?? 0) +
        (backup.references?.kalauds?.length ?? 0) +
        (backup.references?.charcoals?.length ?? 0) +
        (backup.references?.electricHeads?.length ?? 0),
    };
  }

  private userSelectSql(): string {
    return `
      select
        user_account.id::text as id,
        user_account.login,
        user_account.password_hash,
        user_account.role::text as role,
        user_account.email,
        user_account.telegram_username,
        user_account.is_approved,
        user_account.approved_at,
        approved_by.id::text as approved_by_id,
        approved_by.login as approved_by_login,
        user_account.created_at,
        user_account.updated_at
      from auth.users user_account
      left join auth.users approved_by
        on approved_by.id = user_account.approved_by_user_id
    `;
  }

  private tobaccoProjectionSql(): string {
    return `
      tobacco.id::text as id,
      brand.name as brand,
      product_line.name as line,
      tobacco.name as flavor_name,
      product_line.strength_level as line_strength_level,
      coalesce(tobacco.estimated_strength_level, product_line.strength_level) as estimated_strength_level,
      coalesce(tobacco.brightness_level, 3) as brightness_level,
      coalesce(tobacco.flavor_description, '') as flavor_description,
      tobacco.in_stock,
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', tag.id::text,
              'name', tag.name,
              'isActive', tag.is_active
            )
            order by tag.name asc
          )
          from catalog.tobacco_tag_links tag_link
          join catalog.tobacco_tags tag on tag.id = tag_link.tag_id
          where tag_link.tobacco_id = tobacco.id
        ),
        '[]'::jsonb
      ) as flavor_tags,
      tobacco.is_active
    `;
  }

  private async findTobaccoTagById(id: string): Promise<TobaccoTagReference> {
    const tag = (await this.listTobaccoTags()).find((item) => item.id === id);

    if (!tag) {
      throw new NotFoundException('Tobacco tag not found');
    }

    return tag;
  }

  private mapStoredUser(row: Record<string, unknown>): StoredUser {
    return {
      id: row.id as string,
      login: row.login as string,
      passwordHash: row.password_hash as string,
      role: row.role as UserRole,
      email: (row.email as string | null) ?? undefined,
      telegramUsername: (row.telegram_username as string | null) ?? undefined,
      isApproved: Boolean(row.is_approved),
      approvedAt: this.toOptionalIsoString(row.approved_at),
      approvedByUserId: (row.approved_by_id as string | null) ?? undefined,
      createdAt: this.toIsoString(row.created_at),
      updatedAt: this.toIsoString(row.updated_at),
    };
  }

  private mapPublicUserFromAlias(
    row: Record<string, unknown>,
    alias: 'actor' | 'client' | 'accepted_by',
  ): AppUser {
    return {
      id: row[`${alias}_id`] as string,
      login: row[`${alias}_login`] as string,
      role: row[`${alias}_role`] as UserRole,
      email: (row[`${alias}_email`] as string | null) ?? undefined,
      telegramUsername:
        (row[`${alias}_telegram_username`] as string | null) ?? undefined,
      isApproved: Boolean(row[`${alias}_is_approved`]),
      approvedAt: this.toOptionalIsoString(row[`${alias}_approved_at`]),
      approvedBy: row[`${alias}_approved_by_id`]
        ? {
            id: row[`${alias}_approved_by_id`] as string,
            login: row[`${alias}_approved_by_login`] as string,
          }
        : undefined,
      createdAt: this.toIsoString(row[`${alias}_created_at`]),
      updatedAt: this.toIsoString(row[`${alias}_updated_at`]),
    };
  }

  private mapPublicUser(row: Record<string, unknown>): AppUser {
    return {
      id: row.id as string,
      login: row.login as string,
      role: row.role as UserRole,
      email: (row.email as string | null) ?? undefined,
      telegramUsername: (row.telegram_username as string | null) ?? undefined,
      isApproved: Boolean(row.is_approved),
      approvedAt: this.toOptionalIsoString(row.approved_at),
      approvedBy: row.approved_by_id
        ? {
            id: row.approved_by_id as string,
            login: row.approved_by_login as string,
          }
        : undefined,
      createdAt: this.toIsoString(row.created_at),
      updatedAt: this.toIsoString(row.updated_at),
    };
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
      approvedBy: undefined,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private mapTobacco(row: Record<string, unknown>): TobaccoReference {
    return {
      id: row.id as string,
      brand: row.brand as string,
      line: row.line as string,
      flavorName: row.flavor_name as string,
      lineStrengthLevel: Number(row.line_strength_level),
      estimatedStrengthLevel: Number(row.estimated_strength_level),
      brightnessLevel: Number(row.brightness_level),
      flavorDescription: row.flavor_description as string,
      flavorTags: Array.isArray(row.flavor_tags)
        ? (row.flavor_tags as Array<Record<string, unknown>>).map((tag) => ({
            id: tag.id as string,
            name: tag.name as string,
            isActive: Boolean(tag.isActive),
          }))
        : [],
      inStock: Boolean(row.in_stock),
      isActive: Boolean(row.is_active),
    };
  }

  private mapBlendRow(row: DatabaseRow): OrderBlendComponentView {
    return {
      tobacco: this.mapTobacco(row),
      percentage: Number(row.percentage),
    };
  }

  private deduplicateTobaccos(items: TobaccoReference[]): TobaccoReference[] {
    return [...new Map(items.map((item) => [item.id, item])).values()];
  }

  private deduplicateBlendComponents(
    items: OrderBlendComponentView[],
  ): OrderBlendComponentView[] {
    return [
      ...new Map(items.map((item) => [item.tobacco.id, item])).values(),
    ].sort((left, right) =>
      left.tobacco.flavorName.localeCompare(right.tobacco.flavorName),
    );
  }

  private resolveOrderSetupView(
    row: Record<string, unknown>,
    prefix: 'requested' | 'actual',
    references: ReferencesSnapshot,
  ): OrderSetupView | undefined {
    const heatingSystemType = row[`${prefix}_heating_system_type`] as
      | HeatingSystemType
      | null
      | undefined;

    if (!heatingSystemType) {
      return undefined;
    }

    return {
      heatingSystemType,
      packingStyle:
        (row[`${prefix}_packing_style`] as PackingStyle | null) ?? undefined,
      customPackingStyle:
        (row[`${prefix}_custom_packing_style`] as string | null) ?? undefined,
      hookah:
        references.hookahs.find(
          (item) => item.id === row[`${prefix}_hookah_id`],
        ) ?? undefined,
      bowl:
        references.bowls.find((item) => item.id === row[`${prefix}_bowl_id`]) ??
        undefined,
      kalaud:
        references.kalauds.find(
          (item) => item.id === row[`${prefix}_kalaud_id`],
        ) ?? undefined,
      charcoal:
        references.charcoals.find(
          (item) => item.id === row[`${prefix}_charcoal_id`],
        ) ?? undefined,
      electricHead:
        references.electricHeads.find(
          (item) => item.id === row[`${prefix}_electric_head_id`],
        ) ?? undefined,
      charcoalCount: row[`${prefix}_charcoal_count`]
        ? Number(row[`${prefix}_charcoal_count`])
        : undefined,
      warmupMode:
        (row[`${prefix}_warmup_mode`] as 'with_cap' | 'without_cap' | null) ??
        undefined,
      warmupDurationMinutes: row[`${prefix}_warmup_duration_minutes`]
        ? Number(row[`${prefix}_warmup_duration_minutes`])
        : undefined,
    };
  }

  private buildStableCode(prefix: string, value: string): string {
    const hash = createHash('sha1').update(value.toLowerCase()).digest('hex');

    return `${prefix}-${hash.slice(0, 12)}`;
  }

  private toIsoString(value: unknown): string {
    return new Date(value as string | number | Date).toISOString();
  }

  private toOptionalIsoString(value: unknown): string | undefined {
    return value ? this.toIsoString(value) : undefined;
  }

  private requireArray<T>(value: unknown, label: string): T[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException(`${label} must be an array`);
    }

    return value as T[];
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

  private requirePercentageValue(
    value: string | number | boolean | undefined,
    label: string,
  ): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      throw new BadRequestException(`${label} must be a positive number`);
    }

    return Number(value.toFixed(2));
  }

  private async validateOrderSetupInput(
    input: OrderSetupInput,
    label: string,
  ): Promise<OrderSetupInput> {
    if (!input || typeof input !== 'object') {
      throw new BadRequestException(`${label} must be an object`);
    }

    if (
      input.heatingSystemType !== HeatingSystemType.Coal &&
      input.heatingSystemType !== HeatingSystemType.Electric
    ) {
      throw new BadRequestException(`${label}.heatingSystemType is invalid`);
    }

    if (
      input.packingStyle !== undefined &&
      input.packingStyle !== PackingStyle.Layers &&
      input.packingStyle !== PackingStyle.Sectors &&
      input.packingStyle !== PackingStyle.Kompot &&
      input.packingStyle !== PackingStyle.Custom
    ) {
      throw new BadRequestException(`${label}.packingStyle is invalid`);
    }

    const setup: OrderSetupInput = {
      heatingSystemType: input.heatingSystemType,
      packingStyle: input.packingStyle,
      customPackingStyle: this.normalizeOptionalValue(input.customPackingStyle),
      hookahId: input.hookahId
        ? this.requireString(input.hookahId, `${label}.hookahId`)
        : undefined,
      bowlId: input.bowlId
        ? this.requireString(input.bowlId, `${label}.bowlId`)
        : undefined,
      kalaudId: input.kalaudId
        ? this.requireString(input.kalaudId, `${label}.kalaudId`)
        : undefined,
      charcoalId: input.charcoalId
        ? this.requireString(input.charcoalId, `${label}.charcoalId`)
        : undefined,
      electricHeadId: input.electricHeadId
        ? this.requireString(input.electricHeadId, `${label}.electricHeadId`)
        : undefined,
      charcoalCount:
        input.charcoalCount !== undefined
          ? this.requirePositiveNumber(
              input.charcoalCount,
              `${label}.charcoalCount`,
            )
          : undefined,
      warmupMode:
        input.warmupMode === 'with_cap' || input.warmupMode === 'without_cap'
          ? input.warmupMode
          : undefined,
      warmupDurationMinutes:
        input.warmupDurationMinutes !== undefined
          ? this.requirePositiveNumber(
              input.warmupDurationMinutes,
              `${label}.warmupDurationMinutes`,
            )
          : undefined,
    };

    if (
      setup.packingStyle === PackingStyle.Custom &&
      !setup.customPackingStyle
    ) {
      throw new BadRequestException(
        `${label}.customPackingStyle is required for custom packing style`,
      );
    }

    if (setup.heatingSystemType === HeatingSystemType.Coal) {
      if (
        !setup.hookahId ||
        !setup.bowlId ||
        !setup.kalaudId ||
        !setup.charcoalId
      ) {
        throw new BadRequestException(
          `${label} requires hookah, bowl, kalaud and charcoal for coal setup`,
        );
      }
      if (setup.charcoalCount === undefined) {
        throw new BadRequestException(`${label}.charcoalCount is required`);
      }
      if (!setup.warmupMode || setup.warmupDurationMinutes === undefined) {
        throw new BadRequestException(
          `${label} requires warmup mode and duration for coal setup`,
        );
      }
      await Promise.all([
        this.findHookahById(setup.hookahId),
        this.findBowlById(setup.bowlId),
        this.findKalaudById(setup.kalaudId),
        this.findCharcoalById(setup.charcoalId),
      ]);
      return {
        ...setup,
        electricHeadId: undefined,
      };
    }

    if (!setup.hookahId || !setup.electricHeadId) {
      throw new BadRequestException(
        `${label} requires hookah and electric head for electric setup`,
      );
    }

    await Promise.all([
      this.findHookahById(setup.hookahId),
      this.findElectricHeadById(setup.electricHeadId),
    ]);

    return {
      ...setup,
      bowlId: undefined,
      kalaudId: undefined,
      charcoalId: undefined,
      charcoalCount: undefined,
      warmupMode: undefined,
      warmupDurationMinutes: undefined,
    };
  }

  private computeBackupChecksum(payload: BackupPayload): string {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  private async writeBackupAuditEvent(input: {
    actorUserId?: string;
    resourceName: string;
    actionName: string;
    schemaVersion: string;
    checksumSha256: string;
    itemCount: number;
    details: Record<string, unknown>;
  }): Promise<void> {
    await this.databaseService.query(
      `
        insert into support.backup_audit_events (
          actor_user_id,
          resource_name,
          action_name,
          schema_version,
          checksum_sha256,
          item_count,
          details
        )
        values ($1, $2, $3, $4, $5, $6, $7::jsonb)
      `,
      [
        input.actorUserId ?? null,
        input.resourceName,
        input.actionName,
        input.schemaVersion,
        input.checksumSha256,
        input.itemCount,
        JSON.stringify(input.details),
      ],
    );
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

  private handleConstraintError(error: unknown): never {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === '23505'
    ) {
      throw new BadRequestException(
        'Entity with such unique fields already exists',
      );
    }

    throw error;
  }
}
