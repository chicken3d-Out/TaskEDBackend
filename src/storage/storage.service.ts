import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client as MinioClient } from 'minio';
import { randomUUID } from 'crypto';

export interface PresignedUpload {
  uploadUrl: string; // presigned PUT URL - the browser uploads directly to this
  objectKey: string;
  fileUrl: string; // stable public URL to store on the ticket/update once the upload completes
}

// Only these are accepted anywhere in the app (ticket attachments,
// update images) - keyed by the exact Content-Type the frontend must
// send, which is also baked into the presigned URL's signature so a
// mismatched upload is rejected by MinIO itself, not just by our API.
export const ALLOWED_UPLOAD_TYPES: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'application/pdf': ['.pdf'],
};

const PRESIGN_EXPIRY_SECONDS = 5 * 60; // 5 minutes to complete the upload

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private client: MinioClient;
  private bucket: string;
  private publicUrlBase: string;

  constructor(private config: ConfigService) {
    const endPoint = this.config.get<string>('MINIO_ENDPOINT', 'localhost');
    const port = parseInt(this.config.get<string>('MINIO_PORT', '9000'), 10);
    const useSSL = this.config.get<string>('MINIO_USE_SSL', 'false') === 'true';

    this.client = new MinioClient({
      endPoint,
      port,
      useSSL,
      accessKey: this.config.get<string>('MINIO_ACCESS_KEY', 'minioadmin'),
      secretKey: this.config.get<string>('MINIO_SECRET_KEY', 'minioadmin'),
    });

    this.bucket = this.config.get<string>('MINIO_BUCKET', 'tasked-attachments');

    // The endpoint MinIO is reached at from inside the backend (e.g. a
    // Docker service name) is often not the same host browsers can reach
    // it at - override with MINIO_PUBLIC_URL (e.g. a reverse-proxied
    // subdomain) whenever they differ.
    this.publicUrlBase = this.config.get<string>(
      'MINIO_PUBLIC_URL',
      `${useSSL ? 'https' : 'http'}://${endPoint}:${port}`,
    );
  }

  async onModuleInit() {
    try {
      const exists = await this.client.bucketExists(this.bucket);
      if (!exists) {
        await this.client.makeBucket(this.bucket);
        this.logger.log(`Created MinIO bucket "${this.bucket}"`);
      }
      // Public-read so attachment/update-image URLs work directly in
      // <img>/<a> tags without generating a presigned GET on every view.
      // Uploads still require a presigned PUT (below), so nobody can
      // write to the bucket without going through the app first.
      await this.client.setBucketPolicy(this.bucket, JSON.stringify(this.publicReadPolicy()));
    } catch (err) {
      this.logger.warn(
        `Could not verify/configure MinIO bucket "${this.bucket}" on startup - is MinIO running and reachable? (${err})`,
      );
    }
  }

  private publicReadPolicy() {
    return {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: { AWS: ['*'] },
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${this.bucket}/*`],
        },
      ],
    };
  }

  // Namespaced by user so objects are easy to trace/clean up, and a
  // random suffix so two people uploading "photo.jpg" never collide.
  // contentType is baked into the presigned URL's signature (via
  // reqParams) so the actual PUT must send that exact Content-Type
  // header or MinIO rejects it - the allow-list is enforced at the
  // storage layer, not just by our own validation.
  async createPresignedUpload(
    userId: string,
    fileName: string,
    contentType: string,
  ): Promise<PresignedUpload> {
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const objectKey = `${userId}/${randomUUID()}-${safeName}`;

    const uploadUrl = await this.client.presignedUrl(
      'PUT',
      this.bucket,
      objectKey,
      PRESIGN_EXPIRY_SECONDS,
      { 'Content-Type': contentType },
    );

    const fileUrl = `${this.publicUrlBase}/${this.bucket}/${objectKey}`;
    return { uploadUrl, objectKey, fileUrl };
  }
}
