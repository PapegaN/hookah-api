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

export interface OrderRecord {
  id: string;
  clientUserId: string;
  description: string;
  requestedTobaccoIds: string[];
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  acceptedByUserId: string | undefined;
  actualTobaccoIds: string[] | undefined;
  packingComment: string | undefined;
  deliveredAt: string | undefined;
  ratingScore: number | undefined;
  ratingReview: string | undefined;
  ratedAt: string | undefined;
}

export interface OrderView {
  id: string;
  status: OrderStatus;
  description: string;
  createdAt: string;
  updatedAt: string;
  deliveredAt: string | undefined;
  client: AppUser;
  acceptedBy: AppUser | undefined;
  requestedTobaccos: TobaccoReference[];
  actualTobaccos: TobaccoReference[];
  packingComment: string | undefined;
  ratingScore: number | undefined;
  ratingReview: string | undefined;
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
