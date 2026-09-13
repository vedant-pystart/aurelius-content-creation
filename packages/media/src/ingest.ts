import type { AssetRef } from "@aurelius/project-model";
import { MediaError, asMediaError, type Result } from "./errors";
import { fingerprintMedia } from "./fingerprint";
import { MEDIA_LIMITS } from "./storage-policy";
import { sanitizeDisplayName } from "./media-repository";
import { storedAssetToRef, type BinaryInput, type BinaryStore, type ImportProgress, type MediaInspector, type MediaRepository, type PendingImport, type StoragePolicy, type StoredMediaAsset, type ThumbnailGenerator } from "./types";

export interface ImportSuccess { readonly asset: StoredMediaAsset; readonly assetRef: AssetRef; readonly reused: boolean }
export interface ImportFailure { readonly inputName: string; readonly error: MediaError }
export interface BatchImportResult { readonly successes: readonly ImportSuccess[]; readonly failures: readonly ImportFailure[] }
type PendingRepository = MediaRepository & { addPending?(job: PendingImport): Promise<void>; updatePending?(id: string, patch: Partial<PendingImport>): Promise<void>; removePending?(id: string): Promise<void> };

export class MediaIngestService {
  private readonly listeners = new Set<(progress: ImportProgress) => void>();
  constructor(private readonly policy: StoragePolicy, private readonly store: BinaryStore, private readonly inspector: MediaInspector, private readonly thumbnails: ThumbnailGenerator, private readonly repository: PendingRepository, private readonly now: () => string = () => new Date().toISOString(), private readonly createId: () => string = () => crypto.randomUUID()) {}
  subscribe(listener: (progress: ImportProgress) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private progress(importId: string, stage: ImportProgress["stage"], bytesCopied: number, totalBytes: number): void { for (const listener of this.listeners) listener({ importId, stage, bytesCopied, totalBytes }); }
  private async stage(id: string, stage: PendingImport["stage"], bytes: number, total: number): Promise<void> { this.progress(id, stage, bytes, total); await this.repository.updatePending?.(id, { stage, bytesCopied: bytes }); }

  async importOne(projectId: string, input: BinaryInput, signal?: AbortSignal): Promise<Result<ImportSuccess>> {
    const importId = `import-${this.createId()}`; const assetId = `asset-${this.createId()}`; const partialPath = `aurelius/imports/${importId}.partial`; const finalPath = `aurelius/assets/${assetId}/original`; const posterPath = `aurelius/assets/${assetId}/poster.webp`; let promoted = false; let posterWritten = false;
    const pending: PendingImport = { id: importId, projectId, displayName: sanitizeDisplayName(input.name), stage: "copying", bytesCopied: 0, totalBytes: input.size, partialPath, startedAt: this.now() };
    try {
      const budget = await this.policy.assertCanImport(input.size); if (!budget.ok) throw budget.error;
      await this.repository.addPending?.(pending); this.progress(importId, "copying", 0, input.size);
      await this.store.writePartial(partialPath, input, signal, (bytes) => this.progress(importId, "copying", bytes, input.size));
      await this.stage(importId, "inspecting", input.size, input.size);
      const [fingerprint, inspected] = await Promise.all([fingerprintMedia(input), this.inspector.inspect(input, signal)]);
      if (!inspected.ok) throw inspected.error;
      const metadata = inspected.value;
      const bounded = await this.policy.assertCanImport(input.size, metadata.durationUs, metadata.displayWidth, metadata.displayHeight); if (!bounded.ok) throw bounded.error;
      if (metadata.support !== "ready") throw new MediaError("UNSUPPORTED_CODEC", metadata.support === "needs-proxy" ? "This codec needs conversion before editing" : "This codec cannot be edited in this browser", "transcode-and-retry", { stage: "inspect", codecs: metadata.codecs });
      const duplicate = await this.repository.findByFingerprint(fingerprint);
      if (duplicate?.state === "ready") { await this.store.delete(partialPath); await this.repository.link(projectId, duplicate.id); await this.repository.removePending?.(importId); this.progress(importId, "ready", input.size, input.size); return { ok: true, value: { asset: duplicate, assetRef: storedAssetToRef(duplicate), reused: true } }; }
      await this.stage(importId, "deriving", input.size, input.size);
      const thumbnail = await this.thumbnails.create(input, metadata, signal); if (!thumbnail.ok) throw thumbnail.error;
      await this.stage(importId, "promoting", input.size, input.size); await this.store.promote(partialPath, finalPath, input.size); promoted = true;
      if (thumbnail.value) { await this.store.write(posterPath, thumbnail.value.bytes, signal); posterWritten = true; }
      await this.stage(importId, "saving", input.size, input.size);
      const now = this.now(); const asset: StoredMediaAsset = { id: assetId, fingerprint, displayName: sanitizeDisplayName(input.name), ...metadata, sourcePath: finalPath, ...(posterWritten ? { posterPath } : {}), ...(thumbnail.value ? { thumbnailGeneratorVersion: thumbnail.value.generatorVersion } : {}), state: "ready", createdAt: now, updatedAt: now };
      const registered = await this.repository.register(asset, projectId); await this.repository.removePending?.(importId); this.progress(importId, "ready", input.size, input.size);
      return { ok: true, value: { asset: registered, assetRef: storedAssetToRef(registered), reused: false } };
    } catch (cause) {
      const error = asMediaError(cause, "Media import failed");
      await this.repository.updatePending?.(importId, { stage: "failed", errorCode: error.code });
      await Promise.allSettled([this.store.delete(partialPath), ...(promoted ? [this.store.delete(finalPath)] : []), ...(posterWritten ? [this.store.delete(posterPath)] : [])]);
      await this.repository.removePending?.(importId); return { ok: false, error };
    }
  }
  async importBatch(projectId: string, inputs: readonly BinaryInput[], signal?: AbortSignal): Promise<BatchImportResult> {
    if (inputs.length > MEDIA_LIMITS.maxBatchFiles) return { successes: [], failures: inputs.map((input) => ({ inputName: sanitizeDisplayName(input.name), error: new MediaError("OVER_BUDGET", "Choose no more than 20 files at once", "choose-another-file") })) };
    const successes: ImportSuccess[] = []; const failures: ImportFailure[] = [];
    for (const input of inputs) { const result = await this.importOne(projectId, input, signal); if (result.ok) successes.push(result.value); else failures.push({ inputName: sanitizeDisplayName(input.name), error: result.error }); }
    return { successes, failures };
  }
}
