import { assertValidProjectDoc, deriveProjectDurationUs, frameIndexToTimeUs, frameIndex, timeUs, timeUsToFrameIndex, type ProjectDoc } from "@aurelius/project-model";
import type { ExportFailure, ExportScope, RenderSnapshot } from "./contracts";

const clone = <T>(value: T): T => structuredClone(value);
function freeze<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value as Record<string, unknown>)) freeze(child); } return value; }
function failure(code: ExportFailure["code"], message: string, recovery: ExportFailure["recovery"]): never { throw Object.assign(new Error(message), { code, message, recovery } satisfies ExportFailure); }

export function freezeRenderSnapshot(projectInput: ProjectDoc, scope: ExportScope = { kind: "project" }, expectedRevision = projectInput.revision): RenderSnapshot {
  const project = clone(projectInput);
  if (project.revision !== expectedRevision) failure("stale-revision", "The project changed before export could start.", "retry");
  try { assertValidProjectDoc(project); } catch { failure("invalid-project", "Save a valid project before exporting.", "retry"); }
  const rate = project.composition.frameRate.numerator;
  const duration = deriveProjectDurationUs(project);
  const startUs = scope.kind === "project" ? 0 : scope.startUs;
  const endUs = scope.kind === "project" ? duration : scope.endUs;
  if (!Number.isSafeInteger(startUs) || !Number.isSafeInteger(endUs) || startUs < 0 || endUs <= startUs || endUs > duration) failure("invalid-range", "Choose a non-empty range inside this project.", "reduce-range");
  const startFrame = Number(timeUsToFrameIndex(timeUs(startUs), project.composition.frameRate, "ceil"));
  const endFrameExclusive = Number(timeUsToFrameIndex(timeUs(endUs), project.composition.frameRate, "ceil"));
  if (endFrameExclusive <= startFrame) failure("invalid-range", "The selected range does not contain a complete output frame.", "reduce-range");
  const assetIds = new Set(Object.values(project.clips).filter((clip): clip is Extract<typeof clip, { readonly assetId: string }> => clip.enabled && "assetId" in clip).map((clip) => clip.assetId));
  const assets = project.assetOrder.filter((id) => assetIds.has(id)).map((id) => project.assets[id]).filter((asset): asset is NonNullable<typeof asset> => Boolean(asset)).map((asset) => ({ id: asset.id, fingerprint: asset.fingerprint, kind: asset.kind, mimeType: asset.mimeType, byteSize: asset.byteSize }));
  if (assets.length !== assetIds.size) failure("invalid-project", "One or more referenced assets are missing from the saved project.", "relink-media");
  const expectedAudio = Object.values(project.clips).some((clip) => clip.enabled && (clip.kind === "audio" || (clip.kind === "video" && clip.volume > 0)));
  const snapshot: RenderSnapshot = { version: 1, jobId: crypto.randomUUID(), projectId: project.id, projectRevision: project.revision, project, frameRate: rate, startFrame, endFrameExclusive, frameCount: endFrameExclusive - startFrame, durationUs: Number(frameIndexToTimeUs(frameIndex(endFrameExclusive - startFrame), project.composition.frameRate, "nearest")), dimensions: { width: 1080, height: project.composition.height }, expectedAudio, assets, compositionContractVersion: "aurelius-composition-v1", fontContractVersion: "aurelius-fonts-v1" };
  return freeze(snapshot);
}
