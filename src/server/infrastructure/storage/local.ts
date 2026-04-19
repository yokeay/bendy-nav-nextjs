import { promises as fs } from "node:fs";
import path from "node:path";
import type { StorageDriver, StoragePutOptions, StoragePutResult } from "./driver";

export class LocalStorageDriver implements StorageDriver {
  constructor(
    private readonly rootDir: string,
    private readonly publicBaseUrl: string
  ) {}

  private resolvePath(key: string): string {
    const safe = key.replace(/^[\\/]+/, "").replace(/\.\.+/g, "");
    return path.join(this.rootDir, safe);
  }

  async put(key: string, body: Buffer, _options?: StoragePutOptions): Promise<StoragePutResult> {
    const abs = this.resolvePath(key);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, body);
    return { key, url: this.publicUrl(key), size: body.byteLength };
  }

  async delete(key: string): Promise<void> {
    const abs = this.resolvePath(key);
    await fs.rm(abs, { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolvePath(key));
      return true;
    } catch {
      return false;
    }
  }

  publicUrl(key: string): string {
    const normalized = key.replace(/^[\\/]+/, "");
    return `${this.publicBaseUrl.replace(/\/$/, "")}/${normalized}`;
  }
}
