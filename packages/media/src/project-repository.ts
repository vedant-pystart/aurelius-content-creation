import { assertValidProjectDoc, loadProjectDoc, type ProjectDoc, type ProjectRepository, type ProjectSummary } from "@aurelius/project-model";
import { MediaError, asMediaError } from "./errors";
import { AureliusDatabase, type ProjectSummaryRecord } from "./database";
import type { ProjectAssetLink, StoredProjectRecord } from "./types";

const clone = <T>(value: T): T => structuredClone(value);

function summaryOf(doc: ProjectDoc): ProjectSummaryRecord {
  return { id: doc.id, title: doc.title, revision: doc.revision, updatedAt: doc.updatedAt, createdAt: doc.createdAt, width: doc.composition.width, height: doc.composition.height, frameRate: doc.composition.frameRate.numerator };
}

function loadOrThrow(input: unknown): ProjectDoc {
  const loaded = loadProjectDoc(input);
  if (!loaded.ok) throw new MediaError("DATABASE_ERROR", "Stored project data is invalid", "restore-last-known-good", { causeCode: loaded.error.code, diagnosticId: loaded.error.diagnosticId }, loaded.error);
  return loaded.value;
}

export class DexieProjectRepository implements ProjectRepository {
  constructor(readonly db: AureliusDatabase) {}

  async create(input: ProjectDoc): Promise<ProjectDoc> {
    const doc = assertValidProjectDoc(clone(input));
    try {
      await this.db.transaction("rw", this.db.projects, this.db.summaries, this.db.projectAssets, async () => {
        if (await this.db.projects.get(doc.id)) throw new MediaError("DUPLICATE_PROJECT", `Project ${doc.id} already exists`, "retry", { projectId: doc.id });
        const record: StoredProjectRecord = { id: doc.id, current: clone(doc), lastKnownGood: clone(doc), revision: doc.revision };
        await this.db.projects.add(record);
        await this.db.summaries.add(summaryOf(doc));
        const links: ProjectAssetLink[] = doc.assetOrder.map((assetId) => ({ projectId: doc.id, assetId }));
        if (links.length) await this.db.projectAssets.bulkAdd(links);
      });
      return clone(doc);
    } catch (error) { throw asMediaError(error, "Could not create the local project"); }
  }

  async get(id: string): Promise<ProjectDoc | null> {
    const record = await this.db.projects.get(id);
    if (!record) return null;
    return clone(loadOrThrow(record.current));
  }

  async getRecovery(id: string): Promise<ProjectDoc | null> {
    const record = await this.db.projects.get(id);
    if (!record) return null;
    return clone(loadOrThrow(record.lastKnownGood));
  }

  async list(): Promise<readonly ProjectSummary[]> {
    const rows = await this.db.summaries.orderBy("[updatedAt+id]").reverse().toArray();
    return rows.map(({ id, title, revision, updatedAt }) => ({ id, title, revision, updatedAt }));
  }

  async save(input: ProjectDoc, expectedRevision: number): Promise<ProjectDoc> {
    const doc = assertValidProjectDoc(clone(input));
    if (doc.revision !== expectedRevision + 1) throw new MediaError("STALE_PROJECT", "Save is not the next project revision", "reload-latest-project", { expectedRevision, proposedRevision: doc.revision });
    try {
      await this.db.transaction("rw", this.db.projects, this.db.summaries, this.db.projectAssets, async () => {
        const current = await this.db.projects.get(doc.id);
        if (!current) throw new MediaError("DATABASE_ERROR", `Project ${doc.id} no longer exists`, "retry", { projectId: doc.id });
        if (current.revision !== expectedRevision) throw new MediaError("STALE_PROJECT", "This project was changed in another tab", "reload-latest-project", { expectedRevision, actualRevision: current.revision });
        const lastKnownGood = loadOrThrow(current.current);
        await this.db.projects.put({ id: doc.id, current: clone(doc), lastKnownGood: clone(lastKnownGood), revision: doc.revision });
        await this.db.summaries.put(summaryOf(doc));
        const existing = await this.db.projectAssets.where("projectId").equals(doc.id).toArray();
        const desired = new Set(doc.assetOrder);
        const existingIds = new Set(existing.map((item) => item.assetId));
        const removals = existing.filter((item) => !desired.has(item.assetId)).map((item) => [item.projectId, item.assetId] as [string, string]);
        const additions = doc.assetOrder.filter((assetId) => !existingIds.has(assetId)).map((assetId) => ({ projectId: doc.id, assetId }));
        if (removals.length) await this.db.projectAssets.bulkDelete(removals);
        if (additions.length) await this.db.projectAssets.bulkAdd(additions);
      });
      return clone(doc);
    } catch (error) { throw asMediaError(error, "Could not save the local project"); }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.db.transaction("rw", this.db.projects, this.db.summaries, this.db.projectAssets, async () => {
        if (!(await this.db.projects.get(id))) throw new MediaError("DATABASE_ERROR", `Project ${id} does not exist`, "retry", { projectId: id });
        await this.db.projects.delete(id);
        await this.db.summaries.delete(id);
        await this.db.projectAssets.where("projectId").equals(id).delete();
      });
    } catch (error) { throw asMediaError(error, "Could not delete the local project"); }
  }
}
