import { AureliusComposition, type AssetSourceMap } from "@aurelius/composition";
import { frameIndex, frameIndexToTimeUs } from "@aurelius/project-model";
import { renderMediaOnWeb } from "@remotion/web-renderer";
import type { ExportArtifactCandidate } from "@aurelius/media";
import type { ExportArtifactDescriptor, ExportFailure, ExportQuality, ExportStage, RenderSnapshot } from "./contracts";

export interface FrozenAssetSourceResolver { resolve(assetId: string): Promise<string> }
export interface BrowserRenderOptions { readonly quality: ExportQuality; readonly signal: AbortSignal; onProgress?(stage: ExportStage, progress: number): void; onFrameTimestamp?(timestampUs: number): void }
export interface BrowserExportRenderer { render(snapshot: RenderSnapshot, candidate: ExportArtifactCandidate, sources: FrozenAssetSourceResolver, options: BrowserRenderOptions): Promise<ExportArtifactDescriptor> }
const bitrate = (quality: ExportQuality) => quality === "draft" ? 4_500_000 : 12_000_000;
const failure = (code: ExportFailure["code"], message: string): never => { throw Object.assign(new Error(message), { code, message, recovery: "retry" } satisfies ExportFailure); };

/**
 * This invokes Remotion's frame scheduler directly. It never reads a Player,
 * canvas stream, requestAnimationFrame, or wall-clock accumulated frame count.
 */
export class RemotionBrowserExportRenderer implements BrowserExportRenderer {
  async render(snapshot: RenderSnapshot, candidate: ExportArtifactCandidate, sources: FrozenAssetSourceResolver, options: BrowserRenderOptions): Promise<ExportArtifactDescriptor> {
    options.onProgress?.("preparing", 0);
    if (options.signal.aborted) failure("cancelled", "Export was cancelled.");
    const entries = await Promise.all(snapshot.assets.map(async (asset) => [asset.id, await sources.resolve(asset.id)] as const));
    if (options.signal.aborted) failure("cancelled", "Export was cancelled.");
    const assetSources: AssetSourceMap = Object.freeze(Object.fromEntries(entries));
    let emittedFrames = 0;
    try {
      await renderMediaOnWeb({
        composition: { component: AureliusComposition, id: "aurelius-frozen-composition", width: snapshot.dimensions.width, height: snapshot.dimensions.height, fps: snapshot.frameRate, durationInFrames: snapshot.frameCount } as never,
        inputProps: { project: snapshot.project, assetSources },
        container: "mp4", videoCodec: "h264", audioCodec: snapshot.expectedAudio ? "aac" : null, muted: !snapshot.expectedAudio,
        videoBitrate: bitrate(options.quality), audioBitrate: options.quality === "draft" ? 96_000 : 160_000,
        mediaCacheSizeInBytes: 96 * 1024 * 1024, signal: options.signal, outputWritable: candidate.writable as never,
        onProgress: (progress) => { options.onProgress?.(progress.progress >= .97 ? "muxing" : "rendering", progress.progress); },
        onFrame: (videoFrame) => { const expected = Number(frameIndexToTimeUs(frameIndex(emittedFrames), snapshot.project.composition.frameRate, "nearest")); if (videoFrame.timestamp !== expected) throw new Error(`Renderer emitted non-deterministic timestamp ${videoFrame.timestamp}; expected ${expected}`); emittedFrames += 1; options.onFrameTimestamp?.(videoFrame.timestamp); return videoFrame; },
      });
      if (emittedFrames !== snapshot.frameCount) failure("render-failed", "The renderer did not produce every requested frame.");
      if (options.signal.aborted) failure("cancelled", "Export was cancelled.");
      const size = await candidate.close();
      return Object.freeze({ id: candidate.id, filename: "aurelius-video.mp4", mimeType: "video/mp4", size, createdAt: new Date().toISOString(), expectedAudio: snapshot.expectedAudio });
    } catch (error) {
      await candidate.abort();
      if (options.signal.aborted) failure("cancelled", "Export was cancelled.");
      if (error instanceof Error && "code" in error) throw error;
      return failure("render-failed", "The browser could not finish this MP4 export.");
    }
  }
}
