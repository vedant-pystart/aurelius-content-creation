import { timeUs, type AssetRef, type ProjectDoc, type ProjectSummary } from "@aurelius/project-model";
import type { MediaError, Result } from "./errors";

export type MediaKind = "video" | "image" | "audio";
export type DecodeSupport = "ready" | "needs-proxy" | "unsupported";
export type StoredAssetState = "ready" | "missing";

export interface MediaMetadata {
  readonly kind: MediaKind;
  readonly container: string;
  readonly mimeType: string;
  readonly codecs: readonly string[];
  readonly byteSize: number;
  readonly durationUs?: number;
  readonly sourceStartUs?: number;
  readonly codedWidth?: number;
  readonly codedHeight?: number;
  readonly displayWidth?: number;
  readonly displayHeight?: number;
  readonly orientation?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  readonly channels?: number;
  readonly sampleRate?: number;
  readonly variableFrameRate?: boolean;
  readonly support: DecodeSupport;
}

export interface StoredMediaAsset extends MediaMetadata {
  readonly id: string;
  readonly fingerprint: string;
  readonly displayName: string;
  readonly sourcePath: string;
  readonly posterPath?: string;
  readonly proxyPath?: string;
  readonly waveformPath?: string;
  readonly thumbnailGeneratorVersion?: string;
  readonly state: StoredAssetState;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly gcEligibleAt?: string;
}

export interface StoredProjectRecord {
  readonly id: string;
  readonly current: ProjectDoc;
  readonly lastKnownGood: ProjectDoc;
  readonly revision: number;
}

export interface ProjectAssetLink { readonly projectId: string; readonly assetId: string }

export type ImportStage = "copying" | "inspecting" | "deriving" | "promoting" | "saving" | "failed";
export interface PendingImport {
  readonly id: string;
  readonly projectId: string;
  readonly displayName: string;
  readonly stage: ImportStage;
  readonly bytesCopied: number;
  readonly totalBytes: number;
  readonly partialPath: string;
  readonly startedAt: string;
  readonly errorCode?: MediaError["code"];
}
export interface ImportProgress { readonly importId: string; readonly stage: ImportStage | "ready"; readonly bytesCopied: number; readonly totalBytes: number }

export interface BinaryInput {
  readonly size: number;
  readonly lastModified: number;
  readonly type: string;
  readonly name: string;
  stream(): ReadableStream<Uint8Array>;
  slice(start?: number, end?: number): Blob;
}
export interface BinaryStore {
  writePartial(path: string, input: BinaryInput, signal?: AbortSignal, onBytes?: (bytes: number) => void): Promise<void>;
  write(path: string, bytes: Blob, signal?: AbortSignal): Promise<void>;
  promote(partialPath: string, finalPath: string, expectedBytes: number): Promise<void>;
  read(path: string): Promise<Blob>;
  exists(path: string): Promise<boolean>;
  size(path: string): Promise<number | null>;
  delete(path: string): Promise<void>;
  listPartials(): Promise<readonly string[]>;
  cleanupPartials(): Promise<number>;
}

export type PersistenceMode = "persistent" | "best-effort" | "private" | "unsupported";
export interface StorageSnapshot { readonly usage: number; readonly quota: number; readonly available: number; readonly headroom: number; readonly mode: PersistenceMode }
export interface StoragePolicy {
  inspect(): Promise<Result<StorageSnapshot>>;
  assertCanImport(bytes: number, timedDurationUs?: number, width?: number, height?: number, batchSize?: number): Promise<Result<StorageSnapshot>>;
  requestPersistence(): Promise<Result<StorageSnapshot>>;
}
export interface MediaInspector { inspect(input: BinaryInput, signal?: AbortSignal): Promise<Result<MediaMetadata>> }
export interface ThumbnailResult { readonly bytes: Blob; readonly mimeType: "image/webp"; readonly width: number; readonly height: number; readonly generatorVersion: string }
export interface ThumbnailGenerator { create(input: BinaryInput, metadata: MediaMetadata, signal?: AbortSignal): Promise<Result<ThumbnailResult | null>> }

export interface MediaRepository {
  findByFingerprint(fingerprint: string): Promise<StoredMediaAsset | null>;
  get(id: string): Promise<StoredMediaAsset | null>;
  listForProject(projectId: string): Promise<readonly StoredMediaAsset[]>;
  register(asset: StoredMediaAsset, projectId: string): Promise<StoredMediaAsset>;
  link(projectId: string, assetId: string): Promise<void>;
  rename(assetId: string, displayName: string, nowIso: string): Promise<StoredMediaAsset>;
  replace(assetId: string, replacement: StoredMediaAsset): Promise<StoredMediaAsset>;
  markMissing(assetId: string, nowIso: string): Promise<StoredMediaAsset>;
  unlink(projectId: string, assetId: string, nowIso: string): Promise<{ readonly gcCandidate: boolean }>;
  removeIfUnreferenced(assetId: string, nowIso: string): Promise<StoredMediaAsset>;
}

export interface MediaLease { readonly url: string; release(): void }
export interface ProjectRecordRepository {
  create(doc: ProjectDoc): Promise<ProjectDoc>;
  get(id: string): Promise<ProjectDoc | null>;
  list(): Promise<readonly ProjectSummary[]>;
  save(doc: ProjectDoc, expectedRevision: number): Promise<ProjectDoc>;
  delete(id: string): Promise<void>;
}

export function storedAssetToRef(asset: StoredMediaAsset): AssetRef {
  const dimensions = asset.displayWidth && asset.displayHeight ? { width: asset.displayWidth, height: asset.displayHeight } : {};
  const duration = asset.durationUs === undefined ? {} : { durationUs: timeUs(asset.durationUs) };
  return { id: asset.id, name: asset.displayName, kind: asset.kind, mimeType: asset.mimeType, byteSize: asset.byteSize, fingerprint: asset.fingerprint, ...dimensions, ...duration };
}
