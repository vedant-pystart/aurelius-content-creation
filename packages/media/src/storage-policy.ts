import { MediaError, type Result } from "./errors";
import type { StoragePolicy, StorageSnapshot } from "./types";

export const MEDIA_LIMITS = { maxFileBytes: 2 * 1024 ** 3, maxBatchFiles: 20, maxDurationUs: 30 * 60 * 1_000_000, maxDimension: 7680, maxImagePixels: 100_000_000, minimumHeadroom: 256 * 1024 ** 2 } as const;

interface StorageManagerPort { estimate(): Promise<{ usage?: number; quota?: number }>; persisted?(): Promise<boolean>; persist?(): Promise<boolean> }

export class BrowserStoragePolicy implements StoragePolicy {
  constructor(private readonly storage?: StorageManagerPort, private readonly privateMode = false) {}
  async inspect(): Promise<Result<StorageSnapshot>> {
    if (!this.storage?.estimate) return { ok: true, value: { usage: 0, quota: 0, available: 0, headroom: MEDIA_LIMITS.minimumHeadroom, mode: "unsupported" } };
    try {
      const estimate = await this.storage.estimate();
      const usage = Math.max(0, Math.floor(estimate.usage ?? 0)); const quota = Math.max(usage, Math.floor(estimate.quota ?? 0));
      const persistent = this.storage.persisted ? await this.storage.persisted() : false;
      return { ok: true, value: { usage, quota, available: quota - usage, headroom: Math.max(MEDIA_LIMITS.minimumHeadroom, Math.floor(quota * 0.1)), mode: this.privateMode ? "private" : persistent ? "persistent" : "best-effort" } };
    } catch (cause) { return { ok: false, error: new MediaError("STORAGE_UNAVAILABLE", "Browser storage could not be inspected", "retry", {}, cause) }; }
  }
  async assertCanImport(bytes: number, durationUs?: number, width?: number, height?: number, batchSize = 1): Promise<Result<StorageSnapshot>> {
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > MEDIA_LIMITS.maxFileBytes || batchSize > MEDIA_LIMITS.maxBatchFiles || (durationUs !== undefined && durationUs > MEDIA_LIMITS.maxDurationUs) || (width !== undefined && width > MEDIA_LIMITS.maxDimension) || (height !== undefined && height > MEDIA_LIMITS.maxDimension) || (width !== undefined && height !== undefined && width * height > MEDIA_LIMITS.maxImagePixels)) {
      return { ok: false, error: new MediaError("OVER_BUDGET", "This media exceeds the editor's safe import limits", "choose-another-file", { bytes, batchSize }) };
    }
    const inspected = await this.inspect();
    if (!inspected.ok) return inspected;
    if (inspected.value.quota > 0 && inspected.value.available - bytes < inspected.value.headroom) return { ok: false, error: new MediaError("QUOTA_EXCEEDED", "Not enough browser storage remains for this import", "free-space-and-retry", { requiredBytes: bytes }) };
    return inspected;
  }
  async requestPersistence(): Promise<Result<StorageSnapshot>> {
    if (!this.storage?.persist) return this.inspect();
    try { await this.storage.persist(); return this.inspect(); }
    catch (cause) { return { ok: false, error: new MediaError("STORAGE_UNAVAILABLE", "Persistent storage could not be requested", "retry", {}, cause) }; }
  }
}
