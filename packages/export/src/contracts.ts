import type { ProjectDoc } from "@aurelius/project-model";

export type ExportQuality = "draft" | "final";
export type ExportScope = { readonly kind: "project" } | { readonly kind: "range"; readonly startUs: number; readonly endUs: number };
export type RecoveryAction = "relink-media" | "retry-fonts" | "free-storage" | "reduce-range" | "choose-draft" | "server-fallback" | "retry";
export type CheckStatus = "pass" | "warning" | "blocker";

export interface OutputDimensions { readonly width: 1080; readonly height: 1920 | 1350 | 1080 }
export interface FrozenAsset {
  readonly id: string; readonly fingerprint: string; readonly kind: "video" | "image" | "audio";
  readonly mimeType: string; readonly byteSize: number;
}
export interface RenderSnapshot {
  readonly version: 1;
  readonly jobId: string;
  readonly projectId: string;
  readonly projectRevision: number;
  readonly project: ProjectDoc;
  readonly frameRate: 24 | 30 | 60;
  readonly startFrame: number;
  readonly endFrameExclusive: number;
  readonly frameCount: number;
  readonly durationUs: number;
  readonly dimensions: OutputDimensions;
  readonly expectedAudio: boolean;
  readonly assets: readonly FrozenAsset[];
  readonly compositionContractVersion: "aurelius-composition-v1";
  readonly fontContractVersion: "aurelius-fonts-v1";
}
export interface ExportPreflightCheck {
  readonly id: "asset" | "decode" | "video-encoder" | "audio-encoder" | "mp4-muxer" | "output-target" | "fonts" | "storage" | "budget";
  readonly status: CheckStatus;
  readonly label: string;
  readonly detail: string;
  readonly recovery: RecoveryAction;
  readonly diagnostic?: string;
}
export interface ExportPreflightReport {
  readonly snapshotJobId: string;
  readonly checks: readonly ExportPreflightCheck[];
  readonly canRenderLocally: boolean;
  readonly serverFallbackEligible: boolean;
}
export type ExportStage = "idle" | "preflighting" | "ready" | "preparing" | "rendering" | "muxing" | "validating" | "completed" | "failed" | "cancelled";
export interface ExportJobState { readonly stage: ExportStage; readonly progress: number; readonly detail: string; readonly artifact?: ExportArtifactDescriptor; readonly error?: ExportFailure }
export interface ExportArtifactDescriptor { readonly id: string; readonly filename: string; readonly mimeType: "video/mp4"; readonly size: number; readonly createdAt: string; readonly expectedAudio: boolean }
export interface ExportFailure { readonly code: "invalid-project" | "invalid-range" | "stale-revision" | "preflight-blocked" | "render-failed" | "artifact-invalid" | "cancelled"; readonly message: string; readonly recovery: RecoveryAction }
export interface CapabilityResult { readonly supported: boolean; readonly diagnostic?: string }
export interface AssetReadiness { readonly state: "ready" | "missing" | "stale"; readonly sourceDecode: "ready" | "unsupported"; readonly fingerprint: string }
export interface ExportPreflightAdapter {
  asset(id: string): Promise<AssetReadiness>;
  codec(input: { readonly width: number; readonly height: number; readonly fps: number; readonly audio: boolean }): Promise<{ readonly h264: CapabilityResult; readonly aac: CapabilityResult; readonly mp4: CapabilityResult; readonly output: CapabilityResult }>;
  fonts(): Promise<CapabilityResult>;
  storage(): Promise<{ readonly writable: boolean; readonly availableBytes: number; readonly diagnostic?: string }>;
  budget(snapshot: RenderSnapshot): Promise<{ readonly withinBudget: boolean; readonly diagnostic?: string }>;
}
export interface ArtifactProbeFacts { readonly container: string; readonly videoCodec: string; readonly audioCodec?: string; readonly width: number; readonly height: number; readonly fps: number; readonly durationUs: number; readonly decodable: boolean }
export interface ArtifactProbe { probe(artifact: ExportArtifactDescriptor, signal?: AbortSignal): Promise<ArtifactProbeFacts> }
