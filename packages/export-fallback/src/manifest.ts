import type { BinaryStore, MediaRepository } from "@aurelius/media";
import type { RenderSnapshot } from "@aurelius/export";
import { DEFAULT_LOCAL_POLICY, type FallbackDisclosure, type FallbackManifest, type ServerPolicy } from "./contracts";

const digest = async (value: unknown) => { const text = JSON.stringify(value); const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)); return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join(""); };
export async function buildFallbackManifest(snapshot: RenderSnapshot, media: MediaRepository, store: BinaryStore, policy: ServerPolicy = DEFAULT_LOCAL_POLICY, reason = "Local browser MP4 export is unavailable."): Promise<{ readonly manifest: FallbackManifest; readonly disclosure: FallbackDisclosure }> {
  if (snapshot.assets.length > policy.maxAssets || snapshot.durationUs > policy.maxDurationUs) throw new RangeError("This export exceeds the declared server policy.");
  let totalBytes = 0;
  const localAssets = await Promise.all(snapshot.assets.map(async (frozen) => {
    const record = await media.get(frozen.id);
    if (!record || record.state !== "ready" || record.fingerprint !== frozen.fingerprint || record.byteSize !== frozen.byteSize || !await store.exists(record.sourcePath)) throw new Error("Referenced media changed or needs relinking.");
    const actualSize = await store.size(record.sourcePath); if (actualSize !== frozen.byteSize) throw new Error("Referenced media bytes no longer match the frozen project.");
    totalBytes += frozen.byteSize;
    return { id: frozen.id, fingerprint: frozen.fingerprint, byteSize: frozen.byteSize, mimeType: frozen.mimeType, kind: frozen.kind, sourcePath: record.sourcePath, name: record.displayName };
  }));
  if (totalBytes > policy.maxBytes) throw new RangeError("This export exceeds the server's disclosed byte limit.");
  const assets = localAssets.slice().sort((left, right) => left.id.localeCompare(right.id)).map(({ name: _name, ...asset }) => asset);
  const canonical = { version: 1 as const, snapshotJobId: snapshot.jobId, projectId: snapshot.projectId, projectRevision: snapshot.projectRevision, policyVersion: policy.version, assets, dimensions: snapshot.dimensions, frameRate: snapshot.frameRate, frameCount: snapshot.frameCount, expectedAudio: snapshot.expectedAudio };
  const manifest: FallbackManifest = Object.freeze({ ...canonical, manifestHash: await digest(canonical) });
  return Object.freeze({ manifest, disclosure: Object.freeze({ reason, policy: Object.freeze({ ...policy }), assets: Object.freeze(localAssets.slice().sort((left, right) => left.id.localeCompare(right.id)).map(({ id, name, mimeType, byteSize }) => Object.freeze({ id, name, type: mimeType, bytes: byteSize }))), manifestHash: manifest.manifestHash }) });
}
