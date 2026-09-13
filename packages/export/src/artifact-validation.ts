import { frameIndexToTimeUs, frameIndex } from "@aurelius/project-model";
import type { ArtifactProbe, ExportArtifactDescriptor, ExportFailure, RenderSnapshot } from "./contracts";
export async function validateArtifact(snapshot: RenderSnapshot, artifact: ExportArtifactDescriptor, probe: ArtifactProbe): Promise<{ readonly valid: true } | { readonly valid: false; readonly failure: ExportFailure }> {
  try {
    const fact = await probe.probe(artifact);
    const expectedDuration = Number(frameIndexToTimeUs(frameIndex(snapshot.frameCount), snapshot.project.composition.frameRate));
    const tolerance = Math.ceil(1_000_000 / snapshot.frameRate);
    const valid = fact.container === "mp4" && fact.videoCodec.toLowerCase().includes("h264") && fact.width === snapshot.dimensions.width && fact.height === snapshot.dimensions.height && fact.fps === snapshot.frameRate && Math.abs(fact.durationUs - expectedDuration) <= tolerance && fact.decodable && (!snapshot.expectedAudio || fact.audioCodec?.toLowerCase().includes("aac"));
    return valid ? { valid: true } : { valid: false, failure: { code: "artifact-invalid", message: "The MP4 did not pass the final validation checks.", recovery: "retry" } };
  } catch { return { valid: false, failure: { code: "artifact-invalid", message: "The completed file could not be validated.", recovery: "retry" } }; }
}
