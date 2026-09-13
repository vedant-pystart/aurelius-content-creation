import { MediaError, type Result } from "./errors";
import type { BinaryInput, MediaMetadata, ThumbnailGenerator, ThumbnailResult } from "./types";

const MAX_EDGE = 512;
function targetSize(width: number, height: number): [number, number] { const scale = Math.min(1, MAX_EDGE / Math.max(width, height)); return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))]; }
function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> { return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Canvas encode failed")), "image/webp", 0.82)); }

export class BrowserThumbnailGenerator implements ThumbnailGenerator {
  readonly version = "aurelius-thumb-v1";
  async create(input: BinaryInput, metadata: MediaMetadata, signal?: AbortSignal): Promise<Result<ThumbnailResult | null>> {
    if (metadata.kind === "audio") return { ok: true, value: null };
    if (typeof document === "undefined" || typeof createImageBitmap === "undefined") return { ok: true, value: null };
    let bitmap: ImageBitmap | null = null; let url: string | null = null; let video: HTMLVideoElement | null = null;
    try {
      if (signal?.aborted) throw new MediaError("IMPORT_INTERRUPTED", "Import was cancelled", "retry", { stage: "derive" });
      const blob = input instanceof Blob ? input : input.slice(0, input.size);
      if (metadata.kind === "image") bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
      else {
        url = URL.createObjectURL(blob); video = document.createElement("video"); video.muted = true; video.preload = "metadata"; video.src = url;
        await new Promise<void>((resolve, reject) => { video!.onloadeddata = () => resolve(); video!.onerror = () => reject(new Error("Video frame unavailable")); });
        video.currentTime = Math.min(1, Math.max(0, video.duration / 2));
        await new Promise<void>((resolve) => { video!.onseeked = () => resolve(); if (video!.currentTime === 0) resolve(); });
      }
      const width = bitmap?.width ?? video?.videoWidth ?? metadata.displayWidth ?? 1; const height = bitmap?.height ?? video?.videoHeight ?? metadata.displayHeight ?? 1;
      const [targetWidth, targetHeight] = targetSize(width, height);
      const canvas = document.createElement("canvas"); canvas.width = targetWidth; canvas.height = targetHeight;
      const context = canvas.getContext("2d"); if (!context) throw new Error("Canvas unavailable");
      context.drawImage(bitmap ?? video!, 0, 0, targetWidth, targetHeight);
      const bytes = await canvasToBlob(canvas);
      return { ok: true, value: { bytes, mimeType: "image/webp", width: targetWidth, height: targetHeight, generatorVersion: this.version } };
    } catch (cause) { return { ok: false, error: cause instanceof MediaError ? cause : new MediaError("CORRUPT_INPUT", "A preview image could not be created", "choose-another-file", { stage: "derive" }, cause) }; }
    finally { bitmap?.close(); if (video) { video.removeAttribute("src"); video.load(); } if (url) URL.revokeObjectURL(url); }
  }
}
