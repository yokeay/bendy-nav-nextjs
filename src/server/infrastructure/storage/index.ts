import path from "node:path";
import type { StorageDriver, StorageDriverKind } from "./driver";
import { LocalStorageDriver } from "./local";
import { S3StorageDriver } from "./s3";

let instance: StorageDriver | undefined;

function resolveKind(): StorageDriverKind {
  const raw = (process.env.STORAGE_DRIVER ?? "local").toLowerCase();
  return raw === "s3" ? "s3" : "local";
}

function createDriver(): StorageDriver {
  const kind = resolveKind();
  if (kind === "s3") {
    const endpoint = process.env.S3_ENDPOINT;
    const region = process.env.S3_REGION ?? "us-east-1";
    const bucket = process.env.S3_BUCKET;
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
    const publicBaseUrl = process.env.S3_PUBLIC_BASE_URL;
    if (!bucket || !accessKeyId || !secretAccessKey || !publicBaseUrl) {
      throw new Error("STORAGE_DRIVER=s3 requires S3_BUCKET/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY/S3_PUBLIC_BASE_URL.");
    }
    return new S3StorageDriver({ endpoint, region, bucket, accessKeyId, secretAccessKey, publicBaseUrl });
  }

  const rootDir = path.resolve(process.cwd(), process.env.STORAGE_LOCAL_DIR ?? "./runtime/uploads");
  const publicBaseUrl = process.env.STORAGE_LOCAL_PUBLIC_BASE_URL ?? "/uploads";
  return new LocalStorageDriver(rootDir, publicBaseUrl);
}

export function getStorage(): StorageDriver {
  if (!instance) {
    instance = createDriver();
  }
  return instance;
}

export type { StorageDriver } from "./driver";
