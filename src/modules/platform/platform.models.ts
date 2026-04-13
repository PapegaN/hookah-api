export enum UserRole {
  Admin = 'admin',
  HookahMaster = 'hookah_master',
  Client = 'client',
}

export enum OrderStatus {
  New = 'new',
  InProgress = 'in_progress',
  ReadyForFeedback = 'ready_for_feedback',
  Rated = 'rated',
}

export enum OrderTimelineEventType {
  Created = 'created',
  ParticipantJoined = 'participant_joined',
  Started = 'started',
  Delivered = 'delivered',
  FeedbackReceived = 'feedback_received',
}

export enum ReferenceEntityType {
  Tobaccos = 'tobaccos',
  Hookahs = 'hookahs',
  Bowls = 'bowls',
  Kalauds = 'kalauds',
  Charcoals = 'charcoals',
}

export interface AppUser {
  id: string;
  login: string;
  role: UserRole;
  email: string | undefined;
  telegramUsername: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface StoredUser extends AppUser {
  passwordHash: string;
}

export interface TobaccoReference {
  id: string;
  brand: string;
  line: string;
  flavorName: string;
  lineStrengthLevel: number;
  estimatedStrengthLevel: number;
  brightnessLevel: number;
  flavorDescription: string;
  isActive: boolean;
}

export interface HookahReference {
  id: string;
  manufacturer: string;
  name: string;
  innerDiameterMm: number;
  hasDiffuser: boolean;
  isActive: boolean;
}

export interface BowlReference {
  id: string;
  manufacturer: string;
  name: string;
  bowlType: 'phunnel' | 'killer' | 'turka' | 'elian';
  material: string | undefined;
  capacityBucket: 'bucket' | 'large' | 'medium' | 'small' | 'very_small';
  isActive: boolean;
}

export interface KalaudReference {
  id: string;
  manufacturer: string;
  name: string;
  material: string | undefined;
  color: string | undefined;
  isActive: boolean;
}

export interface CharcoalReference {
  id: string;
  manufacturer: string;
  name: string;
  sizeLabel: string;
  isActive: boolean;
}

export interface ReferencesSnapshot {
  tobaccos: TobaccoReference[];
  hookahs: HookahReference[];
  bowls: BowlReference[];
  kalauds: KalaudReference[];
  charcoals: CharcoalReference[];
}

export interface OrderFeedbackRecord {
  clientUserId: string;
  ratingScore: number;
  ratingReview: string | undefined;
  submittedAt: string;
}

export interface OrderParticipantRecord {
  clientUserId: string;
  description: string;
  requestedTobaccoIds: string[];
  joinedAt: string;
  feedback: OrderFeedbackRecord | undefined;
}

export interface OrderTimelineEntryRecord {
  id: string;
  type: OrderTimelineEventType;
  status: OrderStatus;
  occurredAt: string;
  actorUserId: string | undefined;
  note: string;
}

export interface OrderRecord {
  id: string;
  tableLabel: string;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  deliveredAt: string | undefined;
  feedbackAt: string | undefined;
  acceptedByUserId: string | undefined;
  actualTobaccoIds: string[] | undefined;
  packingComment: string | undefined;
  participants: OrderParticipantRecord[];
  timeline: OrderTimelineEntryRecord[];
}

export interface OrderFeedbackView {
  client: AppUser;
  ratingScore: number;
  ratingReview: string | undefined;
  submittedAt: string;
}

export interface OrderParticipantView {
  client: AppUser;
  description: string;
  joinedAt: string;
  requestedTobaccos: TobaccoReference[];
  feedback: OrderFeedbackView | undefined;
}

export interface OrderTimelineEntryView {
  id: string;
  type: OrderTimelineEventType;
  status: OrderStatus;
  occurredAt: string;
  actor: AppUser | undefined;
  note: string;
}

export interface OrderView {
  id: string;
  tableLabel: string;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  deliveredAt: string | undefined;
  feedbackAt: string | undefined;
  acceptedBy: AppUser | undefined;
  participants: OrderParticipantView[];
  requestedTobaccos: TobaccoReference[];
  actualTobaccos: TobaccoReference[];
  packingComment: string | undefined;
  feedbacks: OrderFeedbackView[];
  timeline: OrderTimelineEntryView[];
}

export interface UpsertReferencePayload {
  brand?: string;
  line?: string;
  flavorName?: string;
  lineStrengthLevel?: number;
  estimatedStrengthLevel?: number;
  brightnessLevel?: number;
  flavorDescription?: string;
  manufacturer?: string;
  name?: string;
  innerDiameterMm?: number;
  hasDiffuser?: boolean;
  bowlType?: BowlReference['bowlType'];
  material?: string;
  capacityBucket?: BowlReference['capacityBucket'];
  color?: string;
  sizeLabel?: string;
  isActive?: boolean;
}
