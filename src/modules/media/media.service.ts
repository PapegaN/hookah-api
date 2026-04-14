import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  DatabaseService,
  type DatabaseRow,
} from '../database/database.service';
import type { AppUser } from '../platform/platform.models';
import { UserRole } from '../platform/platform.models';
import type { CompleteMediaUploadDto } from './dto/complete-media-upload.dto';
import type { CreateMediaUploadDto } from './dto/create-media-upload.dto';

export interface MediaAssetView {
  id: string;
  ownerUserId: string | undefined;
  usageType: 'tobacco_gallery' | 'forum_post' | 'forum_comment';
  status: 'draft' | 'uploaded' | 'failed' | 'deleted';
  bucketName: string;
  objectKey: string;
  originalFileName: string;
  mimeType: string;
  byteSize: number;
  checksumSha256: string | undefined;
  widthPx: number | undefined;
  heightPx: number | undefined;
  publicUrl: string | undefined;
  uploadedAt: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface MediaUploadIntentView {
  asset: MediaAssetView;
  uploadUrl: string;
  uploadMethod: 'PUT';
  uploadHeaders: Record<string, string>;
  expiresInSeconds: number;
}

@Injectable()
export class MediaService {
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly publicBaseUrl: string;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly configService: ConfigService,
  ) {
    const endpoint = this.requireConfig('OBJECT_STORAGE_ENDPOINT');
    this.bucketName = this.requireConfig('OBJECT_STORAGE_BUCKET_HOOKAH_MEDIA');
    this.publicBaseUrl = this.requireConfig('OBJECT_STORAGE_PUBLIC_URL');

    this.s3Client = new S3Client({
      region:
        this.configService.get<string>('OBJECT_STORAGE_REGION') ?? 'ru-msk-1',
      endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: this.requireConfig('OBJECT_STORAGE_ACCESS_KEY'),
        secretAccessKey: this.requireConfig('OBJECT_STORAGE_SECRET_KEY'),
      },
    });
  }

  async createUploadIntent(
    actor: AppUser,
    input: CreateMediaUploadDto,
  ): Promise<MediaUploadIntentView> {
    const fileName = this.requireTrimmed(input.fileName, 'fileName');
    const mimeType = this.requireAllowedMimeType(input.mimeType);
    const byteSize = this.requirePositiveByteSize(input.byteSize);
    const objectKey = this.buildObjectKey(input.usageType, fileName);

    const assetResult = await this.databaseService.query(
      `
        insert into media.assets (
          owner_user_id,
          usage_type,
          status,
          bucket_name,
          object_key,
          original_file_name,
          mime_type,
          byte_size,
          public_url
        )
        values ($1, $2, 'draft', $3, $4, $5, $6, $7, $8)
        returning
          id::text as id,
          owner_user_id::text as owner_user_id,
          usage_type,
          status,
          bucket_name,
          object_key,
          original_file_name,
          mime_type,
          byte_size,
          checksum_sha256,
          width_px,
          height_px,
          public_url,
          uploaded_at,
          created_at,
          updated_at
      `,
      [
        actor.id,
        input.usageType,
        this.bucketName,
        objectKey,
        fileName,
        mimeType,
        byteSize,
        this.buildPublicUrl(objectKey),
      ],
    );

    const asset = this.mapAsset(assetResult.rows[0]!);
    const uploadHeaders = {
      'Content-Type': mimeType,
    };
    const expiresInSeconds = 900;
    const uploadUrl = await getSignedUrl(
      this.s3Client,
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: objectKey,
        ContentType: mimeType,
      }),
      { expiresIn: expiresInSeconds },
    );

    return {
      asset,
      uploadUrl,
      uploadMethod: 'PUT',
      uploadHeaders,
      expiresInSeconds,
    };
  }

  async completeUpload(
    actor: AppUser,
    assetId: string,
    input: CompleteMediaUploadDto,
  ): Promise<MediaAssetView> {
    const asset = await this.findAssetById(assetId);

    if (!asset) {
      throw new NotFoundException('Media asset not found');
    }

    if (asset.ownerUserId !== actor.id && actor.role !== UserRole.Admin) {
      throw new ForbiddenException('You cannot complete this asset');
    }

    const result = await this.databaseService.query(
      `
        update media.assets
        set
          status = 'uploaded',
          checksum_sha256 = $2,
          width_px = $3,
          height_px = $4,
          uploaded_at = now()
        where id = $1
        returning
          id::text as id,
          owner_user_id::text as owner_user_id,
          usage_type,
          status,
          bucket_name,
          object_key,
          original_file_name,
          mime_type,
          byte_size,
          checksum_sha256,
          width_px,
          height_px,
          public_url,
          uploaded_at,
          created_at,
          updated_at
      `,
      [
        assetId,
        this.normalizeOptionalString(input.checksumSha256) ?? null,
        input.widthPx ?? null,
        input.heightPx ?? null,
      ],
    );

    return this.mapAsset(result.rows[0]!);
  }

  async listAssets(limit = 20): Promise<MediaAssetView[]> {
    const result = await this.databaseService.query(
      `
        select
          id::text as id,
          owner_user_id::text as owner_user_id,
          usage_type,
          status,
          bucket_name,
          object_key,
          original_file_name,
          mime_type,
          byte_size,
          checksum_sha256,
          width_px,
          height_px,
          public_url,
          uploaded_at,
          created_at,
          updated_at
        from media.assets
        order by created_at desc
        limit $1
      `,
      [limit],
    );

    return result.rows.map((row) => this.mapAsset(row));
  }

  private async findAssetById(id: string): Promise<MediaAssetView | undefined> {
    const result = await this.databaseService.query(
      `
        select
          id::text as id,
          owner_user_id::text as owner_user_id,
          usage_type,
          status,
          bucket_name,
          object_key,
          original_file_name,
          mime_type,
          byte_size,
          checksum_sha256,
          width_px,
          height_px,
          public_url,
          uploaded_at,
          created_at,
          updated_at
        from media.assets
        where id = $1
        limit 1
      `,
      [id],
    );

    return result.rows[0] ? this.mapAsset(result.rows[0]) : undefined;
  }

  private buildObjectKey(
    usageType: CreateMediaUploadDto['usageType'],
    fileName: string,
  ): string {
    const safeFileName = fileName
      .normalize('NFKD')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();
    const now = new Date();
    const datePath = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${String(now.getUTCDate()).padStart(2, '0')}`;

    return `${usageType}/${datePath}/${randomUUID()}-${safeFileName || 'upload.bin'}`;
  }

  private buildPublicUrl(objectKey: string): string {
    const base = this.publicBaseUrl.replace(/\/$/, '');
    const encodedPath = objectKey
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');

    return `${base}/${this.bucketName}/${encodedPath}`;
  }

  private mapAsset(row: DatabaseRow): MediaAssetView {
    return {
      id: row.id as string,
      ownerUserId: (row.owner_user_id as string | null) ?? undefined,
      usageType: row.usage_type as MediaAssetView['usageType'],
      status: row.status as MediaAssetView['status'],
      bucketName: row.bucket_name as string,
      objectKey: row.object_key as string,
      originalFileName: row.original_file_name as string,
      mimeType: row.mime_type as string,
      byteSize: Number(row.byte_size),
      checksumSha256: (row.checksum_sha256 as string | null) ?? undefined,
      widthPx: row.width_px ? Number(row.width_px) : undefined,
      heightPx: row.height_px ? Number(row.height_px) : undefined,
      publicUrl: (row.public_url as string | null) ?? undefined,
      uploadedAt: row.uploaded_at
        ? new Date(row.uploaded_at as string).toISOString()
        : undefined,
      createdAt: new Date(row.created_at as string).toISOString(),
      updatedAt: new Date(row.updated_at as string).toISOString(),
    };
  }

  private requireConfig(name: string): string {
    const value = this.configService.get<string>(name);

    if (!value) {
      throw new BadRequestException(`${name} is not configured`);
    }

    return value;
  }

  private requireTrimmed(value: string, label: string): string {
    const normalized = value.trim();

    if (!normalized) {
      throw new BadRequestException(`${label} is required`);
    }

    return normalized;
  }

  private requireAllowedMimeType(value: string): string {
    const normalized = this.requireTrimmed(value, 'mimeType').toLowerCase();
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];

    if (!allowedMimeTypes.includes(normalized)) {
      throw new BadRequestException('mimeType is not allowed');
    }

    return normalized;
  }

  private requirePositiveByteSize(value: number): number {
    if (!Number.isInteger(value) || value <= 0) {
      throw new BadRequestException('byteSize must be a positive integer');
    }

    return value;
  }

  private normalizeOptionalString(
    value: string | undefined,
  ): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  }
}
