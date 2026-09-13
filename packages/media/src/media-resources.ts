import type { BinaryStore, MediaLease } from "./types";

interface Entry { refs: number; version: string; generation: number; url?: string; loading: Promise<string> | undefined; revokeTimer?: unknown }
export interface ResourceScheduler { set(delayMs: number, callback: () => void): unknown; clear(handle: unknown): void }
const scheduler: ResourceScheduler = { set: (delay, callback) => setTimeout(callback, delay), clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>) };

export class MediaResourceManager {
  private readonly entries = new Map<string, Entry>(); private generation = 0;
  constructor(private readonly store: BinaryStore, private readonly createUrl: (blob: Blob) => string = URL.createObjectURL.bind(URL), private readonly revokeUrl: (url: string) => void = URL.revokeObjectURL.bind(URL), private readonly timer: ResourceScheduler = scheduler, private readonly graceMs = 250) {}
  async acquire(assetId: string, version: string, path: string): Promise<MediaLease> {
    const key = `${assetId}:${version}`;
    for (const [otherKey, entry] of this.entries) if (otherKey.startsWith(`${assetId}:`) && otherKey !== key && entry.refs === 0) this.revoke(otherKey, entry);
    let entry = this.entries.get(key);
    if (!entry) { entry = { refs: 0, version, generation: ++this.generation, loading: undefined }; this.entries.set(key, entry); }
    if (entry.revokeTimer !== undefined) { this.timer.clear(entry.revokeTimer); entry.revokeTimer = undefined; }
    entry.refs += 1;
    if (!entry.url) {
      const token = entry.generation;
      entry.loading ??= this.store.read(path).then((blob) => {
        const url = this.createUrl(blob); const latest = this.entries.get(key);
        if (!latest || latest.generation !== token) { this.revokeUrl(url); throw new Error("Media resource was superseded"); }
        latest.url = url; latest.loading = undefined; return url;
      }).catch((error) => { const latest = this.entries.get(key); if (latest?.generation === token) this.entries.delete(key); throw error; });
      try { await entry.loading; } catch (error) { entry.refs = Math.max(0, entry.refs - 1); throw error; }
    }
    let released = false;
    return { url: entry.url!, release: () => { if (released) return; released = true; this.release(key); } };
  }
  private release(key: string): void { const entry = this.entries.get(key); if (!entry) return; entry.refs = Math.max(0, entry.refs - 1); if (entry.refs === 0) entry.revokeTimer = this.timer.set(this.graceMs, () => this.revoke(key, entry)); }
  private revoke(key: string, entry: Entry): void { if (entry.url) this.revokeUrl(entry.url); entry.generation = ++this.generation; this.entries.delete(key); }
  dispose(): void { for (const [key, entry] of this.entries) { if (entry.revokeTimer !== undefined) this.timer.clear(entry.revokeTimer); this.revoke(key, entry); } }
  diagnostics(): { readonly entries: number; readonly urls: number; readonly leases: number } { let urls = 0; let leases = 0; for (const entry of this.entries.values()) { if (entry.url) urls += 1; leases += entry.refs; } return { entries: this.entries.size, urls, leases }; }
}
