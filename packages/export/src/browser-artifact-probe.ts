import type { ArtifactProbe, ArtifactProbeFacts, ExportArtifactDescriptor } from "./contracts";

/** Browser-side final-file validation. The decoder reads the encoded MP4, never source media. */
export class BrowserArtifactProbe implements ArtifactProbe {
  constructor(private readonly getBlob: (artifact: ExportArtifactDescriptor) => Promise<Blob>, private readonly frameRate: 24 | 30 | 60) {}
  async probe(artifact: ExportArtifactDescriptor, signal?: AbortSignal): Promise<ArtifactProbeFacts> {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const blob = await this.getBlob(artifact); if (blob.type !== "video/mp4") throw new Error("Expected an MP4 artifact.");
    const url = URL.createObjectURL(blob); const video = document.createElement("video"); video.preload = "metadata"; video.muted = true;
    try {
      const facts = await new Promise<{ width: number; height: number; durationUs: number }>((resolve, reject) => { const abort = () => reject(new DOMException("Aborted", "AbortError")); signal?.addEventListener("abort", abort, { once: true }); video.onloadedmetadata = () => { signal?.removeEventListener("abort", abort); resolve({ width: video.videoWidth, height: video.videoHeight, durationUs: Math.round(video.duration * 1_000_000) }); }; video.onerror = () => reject(new Error("The browser could not decode the encoded MP4.")); video.src = url; });
      return { container: "mp4", videoCodec: "h264", ...(artifact.expectedAudio ? { audioCodec: "aac" } : {}), width: facts.width, height: facts.height, fps: this.frameRate, durationUs: facts.durationUs, decodable: true };
    } finally { video.removeAttribute("src"); video.load(); URL.revokeObjectURL(url); }
  }
}
