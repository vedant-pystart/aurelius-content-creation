import Dexie, { type Table } from "dexie";
import type { ProjectSummary } from "@aurelius/project-model";
import type { PendingImport, ProjectAssetLink, StoredMediaAsset, StoredProjectRecord } from "./types";

export interface ProjectSummaryRecord extends ProjectSummary {
  readonly createdAt: string;
  readonly width: number;
  readonly height: number;
  readonly frameRate: number;
}
export interface PreferenceRecord { readonly key: string; readonly value: unknown }

export class AureliusDatabase extends Dexie {
  projects!: Table<StoredProjectRecord, string>;
  summaries!: Table<ProjectSummaryRecord, string>;
  assets!: Table<StoredMediaAsset, string>;
  projectAssets!: Table<ProjectAssetLink, [string, string]>;
  pendingImports!: Table<PendingImport, string>;
  preferences!: Table<PreferenceRecord, string>;

  constructor(name = "aurelius-video-studio", options?: { indexedDB?: IDBFactory; IDBKeyRange?: typeof IDBKeyRange }) {
    super(name, options);
    this.version(1).stores({
      projects: "id",
      summaries: "id,[updatedAt+id]",
      assets: "id,&fingerprint,state,updatedAt",
      projectAssets: "[projectId+assetId],projectId,assetId",
      pendingImports: "id,stage,projectId",
      preferences: "key",
    });
  }
}
