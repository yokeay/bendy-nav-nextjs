export interface StoragePutOptions {
  contentType?: string;
  cacheControl?: string;
}

export interface StoragePutResult {
  key: string;
  url: string;
  size: number;
}

export interface StorageDriver {
  put(key: string, body: Buffer, options?: StoragePutOptions): Promise<StoragePutResult>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  publicUrl(key: string): string;
}

export type StorageDriverKind = "local" | "s3";
