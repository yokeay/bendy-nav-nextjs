import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import type { StorageDriver, StoragePutOptions, StoragePutResult } from "./driver";

export interface S3StorageOptions {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
  forcePathStyle?: boolean;
}

export class S3StorageDriver implements StorageDriver {
  private readonly client: S3Client;
  constructor(private readonly opts: S3StorageOptions) {
    this.client = new S3Client({
      region: opts.region,
      endpoint: opts.endpoint,
      forcePathStyle: opts.forcePathStyle ?? Boolean(opts.endpoint),
      credentials: { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey }
    });
  }

  async put(key: string, body: Buffer, options?: StoragePutOptions): Promise<StoragePutResult> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.opts.bucket,
        Key: key,
        Body: body,
        ContentType: options?.contentType,
        CacheControl: options?.cacheControl
      })
    );
    return { key, url: this.publicUrl(key), size: body.byteLength };
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.opts.bucket, Key: key }));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.opts.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  publicUrl(key: string): string {
    return `${this.opts.publicBaseUrl.replace(/\/$/, "")}/${key.replace(/^[\\/]+/, "")}`;
  }
}
