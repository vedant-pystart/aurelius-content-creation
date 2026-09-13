import { AureliusDatabase } from "./database";
import { MediaError, asMediaError } from "./errors";
import type { BinaryStore, MediaRepository, PendingImport, StoredMediaAsset } from "./types";

const clone = <T>(value: T): T => structuredClone(value);

export class DexieMediaRepository implements MediaRepository {
  constructor(readonly db: AureliusDatabase) {}
  async findByFingerprint(fingerprint: string): Promise<StoredMediaAsset | null> { const row = await this.db.assets.where("fingerprint").equals(fingerprint).first(); return row ? clone(row) : null; }
  async get(id: string): Promise<StoredMediaAsset | null> { const row = await this.db.assets.get(id); return row ? clone(row) : null; }
  async listForProject(projectId: string): Promise<readonly StoredMediaAsset[]> {
    const links = await this.db.projectAssets.where("projectId").equals(projectId).toArray();
    const rows = await this.db.assets.bulkGet(links.map((link) => link.assetId));
    return rows.filter((row): row is StoredMediaAsset => Boolean(row)).map(clone).sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }
  async register(asset: StoredMediaAsset, projectId: string): Promise<StoredMediaAsset> {
    try {
      await this.db.transaction("rw", this.db.assets, this.db.projectAssets, async () => {
        const duplicate = await this.db.assets.where("fingerprint").equals(asset.fingerprint).first();
        if (duplicate && duplicate.id !== asset.id) throw new MediaError("ASSET_REFERENCED", "Identical media is already stored", "retry", { existingAssetId: duplicate.id });
        await this.db.assets.add(clone(asset));
        await this.db.projectAssets.put({ projectId, assetId: asset.id });
      });
      return clone(asset);
    } catch (cause) { throw asMediaError(cause, "Could not register imported media"); }
  }
  async link(projectId: string, assetId: string): Promise<void> { if (!(await this.db.assets.get(assetId))) throw new MediaError("ASSET_NOT_FOUND", "Media is no longer available", "relink-source", { assetId }); await this.db.projectAssets.put({ projectId, assetId }); }
  async rename(assetId: string, displayName: string, nowIso: string): Promise<StoredMediaAsset> { const current = await this.require(assetId); const updated = { ...current, displayName: sanitizeDisplayName(displayName), updatedAt: nowIso }; await this.db.assets.put(updated); return clone(updated); }
  async replace(assetId: string, replacement: StoredMediaAsset): Promise<StoredMediaAsset> {
    const current = await this.require(assetId);
    if (current.kind !== replacement.kind) throw new MediaError("RELINK_MISMATCH", "Replacement must be the same media type", "choose-another-file", { assetId });
    const duplicate = await this.findByFingerprint(replacement.fingerprint);
    if (duplicate && duplicate.id !== assetId) throw new MediaError("RELINK_MISMATCH", "Replacement is already used by another asset", "choose-another-file", { assetId });
    const updated = { ...replacement, id: assetId };
    await this.db.assets.put(updated); return clone(updated);
  }
  async markMissing(assetId: string, nowIso: string): Promise<StoredMediaAsset> { const current = await this.require(assetId); const updated = { ...current, state: "missing" as const, updatedAt: nowIso }; await this.db.assets.put(updated); return clone(updated); }
  async unlink(projectId: string, assetId: string, nowIso: string): Promise<{ readonly gcCandidate: boolean }> {
    await this.db.projectAssets.delete([projectId, assetId]); const reachable = await this.isReachable(assetId);
    if (!reachable) { const asset = await this.require(assetId); await this.db.assets.put({ ...asset, gcEligibleAt: nowIso, updatedAt: nowIso }); }
    return { gcCandidate: !reachable };
  }
  async removeIfUnreferenced(assetId: string, nowIso: string): Promise<StoredMediaAsset> {
    const asset = await this.require(assetId);
    if (await this.isReachable(assetId)) throw new MediaError("ASSET_REFERENCED", "Media is still used by a project or recovery revision", "remove-unused-media", { assetId });
    const candidate = { ...asset, gcEligibleAt: asset.gcEligibleAt ?? nowIso, updatedAt: nowIso };
    await this.db.assets.put(candidate); return clone(candidate);
  }
  async reconcile(assetId: string, store: BinaryStore, nowIso: string): Promise<StoredMediaAsset> { const asset = await this.require(assetId); return await store.exists(asset.sourcePath) ? asset : this.markMissing(assetId, nowIso); }
  async addPending(job: PendingImport): Promise<void> { await this.db.pendingImports.put(clone(job)); }
  async updatePending(id: string, patch: Partial<PendingImport>): Promise<void> { await this.db.pendingImports.update(id, patch); }
  async removePending(id: string): Promise<void> { await this.db.pendingImports.delete(id); }
  async listPending(): Promise<readonly PendingImport[]> { return (await this.db.pendingImports.toArray()).map(clone); }
  private async require(id: string): Promise<StoredMediaAsset> { const row = await this.db.assets.get(id); if (!row) throw new MediaError("ASSET_NOT_FOUND", "Media record is missing", "relink-source", { assetId: id }); return row; }
  private async isReachable(assetId: string): Promise<boolean> {
    if (await this.db.projectAssets.where("assetId").equals(assetId).count()) return true;
    const projects = await this.db.projects.toArray();
    return projects.some((record) => record.current.assetOrder.includes(assetId) || record.lastKnownGood.assetOrder.includes(assetId));
  }
}

export function sanitizeDisplayName(value: string): string {
  const name = value.replaceAll("\\", "/").split("/").at(-1)?.replace(/[\u0000-\u001f\u007f]/gu, "").trim().slice(0, 240) ?? "";
  return name || "Untitled media";
}
