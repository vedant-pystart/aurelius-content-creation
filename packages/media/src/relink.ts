import { executeCommand, type AssetRef, type ProjectDoc, type ProjectRepository } from "@aurelius/project-model";
import { MediaError, type Result } from "./errors";
import { fingerprintMedia } from "./fingerprint";
import { sanitizeDisplayName } from "./media-repository";
import { storedAssetToRef, type BinaryInput, type BinaryStore, type MediaInspector, type MediaRepository, type StoragePolicy, type StoredMediaAsset, type ThumbnailGenerator } from "./types";

export interface MissingAsset { readonly ref: AssetRef; readonly reason: "record-missing" | "source-missing" }
export interface RelinkSuggestion { readonly asset: StoredMediaAsset; readonly confidence: "exact" | "weak"; readonly reason: string }

export class RelinkService {
  constructor(private readonly projects: ProjectRepository, private readonly media: MediaRepository, private readonly store: BinaryStore, private readonly policy: StoragePolicy, private readonly inspector: MediaInspector, private readonly thumbnails: ThumbnailGenerator, private readonly now: () => string = () => new Date().toISOString(), private readonly createId: () => string = () => crypto.randomUUID()) {}
  async reconcileProject(project: ProjectDoc): Promise<readonly MissingAsset[]> {
    const missing: MissingAsset[] = [];
    for (const id of project.assetOrder) { const ref = project.assets[id]!; const asset = await this.media.get(id); if (!asset) missing.push({ ref, reason: "record-missing" }); else if (!(await this.store.exists(asset.sourcePath))) { await this.media.markMissing(id, this.now()); missing.push({ ref, reason: "source-missing" }); } }
    return missing;
  }
  async suggest(ref: AssetRef, candidates: readonly StoredMediaAsset[]): Promise<readonly RelinkSuggestion[]> { return candidates.filter((item) => item.kind === ref.kind).map((asset) => asset.fingerprint === ref.fingerprint ? { asset, confidence: "exact" as const, reason: "Same content fingerprint" } : { asset, confidence: "weak" as const, reason: asset.byteSize === ref.byteSize && asset.displayName === ref.name ? "Same name and size — confirm manually" : "Same media type — confirm manually" }).sort((a,b) => a.confidence === b.confidence ? a.asset.displayName.localeCompare(b.asset.displayName) : a.confidence === "exact" ? -1 : 1); }
  async relink(projectInput: ProjectDoc, assetId: string, input: BinaryInput, signal?: AbortSignal): Promise<Result<ProjectDoc>> {
    const ref = projectInput.assets[assetId]; if (!ref) return { ok: false, error: new MediaError("ASSET_NOT_FOUND", "The missing media reference no longer exists", "retry", { assetId }) };
    const token = `relink-${this.createId()}`; const partial = `aurelius/imports/${token}.partial`; const sourcePath = `aurelius/assets/${token}/original`; const posterPath = `aurelius/assets/${token}/poster.webp`; let promoted = false; let poster = false; const previous = await this.media.get(assetId);
    try {
      const budget = await this.policy.assertCanImport(input.size); if (!budget.ok) throw budget.error;
      await this.store.writePartial(partial, input, signal);
      const [fingerprint, inspected] = await Promise.all([fingerprintMedia(input), this.inspector.inspect(input, signal)]); if (!inspected.ok) throw inspected.error;
      if (inspected.value.kind !== ref.kind) throw new MediaError("RELINK_MISMATCH", "Selected file is a different media type", "choose-another-file", { assetId });
      if (inspected.value.support !== "ready") throw new MediaError("UNSUPPORTED_CODEC", "Selected file needs conversion before relinking", "transcode-and-retry", { assetId });
      const thumb = await this.thumbnails.create(input, inspected.value, signal); if (!thumb.ok) throw thumb.error;
      await this.store.promote(partial, sourcePath, input.size); promoted = true;
      if (thumb.value) { await this.store.write(posterPath, thumb.value.bytes, signal); poster = true; }
      const now = this.now(); const replacement: StoredMediaAsset = { id: assetId, displayName: sanitizeDisplayName(input.name), fingerprint, ...inspected.value, sourcePath, ...(poster ? { posterPath } : {}), ...(thumb.value ? { thumbnailGeneratorVersion: thumb.value.generatorVersion } : {}), state: "ready", createdAt: previous?.createdAt ?? now, updatedAt: now };
      const { id: _stableId, ...metadata } = storedAssetToRef(replacement);
      const { nextDoc } = executeCommand(projectInput, { type: "asset/replaceMetadata", expectedRevision: projectInput.revision, assetId, metadata }, { committedAtIso: now });
      await this.media.replace(assetId, replacement);
      try { await this.projects.save(nextDoc, projectInput.revision); }
      catch (error) { if (previous) await this.media.replace(assetId, previous); throw error; }
      if (previous && previous.sourcePath !== replacement.sourcePath) void this.store.delete(previous.sourcePath);
      return { ok: true, value: nextDoc };
    } catch (cause) {
      await Promise.allSettled([this.store.delete(partial), ...(promoted ? [this.store.delete(sourcePath)] : []), ...(poster ? [this.store.delete(posterPath)] : [])]);
      return { ok: false, error: cause instanceof MediaError ? cause : new MediaError("RELINK_MISMATCH", "Media could not be relinked safely", "choose-another-file", { assetId }, cause) };
    }
  }
}
