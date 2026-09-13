import { parseMedia } from "@remotion/media-parser";
import { MediaError, type Result } from "./errors";
import type { BinaryInput, DecodeSupport, MediaInspector, MediaMetadata } from "./types";

type Signature = { readonly kind: "timed" | "image"; readonly container: string; readonly mimeType: string };

function ascii(bytes: Uint8Array, start: number, length: number): string { return String.fromCharCode(...bytes.slice(start, start + length)); }
function signature(bytes: Uint8Array): Signature | null {
  if (bytes.length >= 12 && ascii(bytes, 4, 4) === "ftyp") return { kind: "timed", container: "mp4", mimeType: "video/mp4" };
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return { kind: "timed", container: "webm", mimeType: "video/webm" };
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WAVE") return { kind: "timed", container: "wav", mimeType: "audio/wav" };
  if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(bytes, 1, 3) === "PNG") return { kind: "image", container: "png", mimeType: "image/png" };
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { kind: "image", container: "jpeg", mimeType: "image/jpeg" };
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return { kind: "image", container: "webp", mimeType: "image/webp" };
  if (bytes.length >= 6 && (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a")) return { kind: "image", container: "gif", mimeType: "image/gif" };
  if (bytes.length >= 3 && (ascii(bytes, 0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0))) return { kind: "timed", container: "mp3", mimeType: "audio/mpeg" };
  return null;
}

function uint16(view: DataView, offset: number, little: boolean): number { return view.getUint16(offset, little); }
function jpegInfo(bytes: Uint8Array): { width: number; height: number; orientation: 1|2|3|4|5|6|7|8 } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); let offset = 2; let width = 0; let height = 0; let orientation: 1|2|3|4|5|6|7|8 = 1;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1]!; const length = view.getUint16(offset + 2, false);
    if (length < 2 || offset + 2 + length > bytes.length) break;
    if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) { height = view.getUint16(offset + 5, false); width = view.getUint16(offset + 7, false); }
    if (marker === 0xe1 && ascii(bytes, offset + 4, 6) === "Exif\0\0") {
      const tiff = offset + 10; const little = ascii(bytes, tiff, 2) === "II"; const ifd = tiff + view.getUint32(tiff + 4, little);
      if (ifd + 2 <= bytes.length) for (let i = 0, count = uint16(view, ifd, little); i < count; i += 1) { const entry = ifd + 2 + i * 12; if (entry + 12 <= bytes.length && uint16(view, entry, little) === 0x0112) { const value = uint16(view, entry + 8, little); if (value >= 1 && value <= 8) orientation = value as typeof orientation; } }
    }
    offset += 2 + length;
  }
  if (!width || !height) throw new MediaError("CORRUPT_INPUT", "JPEG dimensions could not be read", "choose-another-file", { stage: "inspect" });
  return { width, height, orientation };
}

function imageInfo(bytes: Uint8Array, container: string): { width: number; height: number; orientation: 1|2|3|4|5|6|7|8 } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (container === "jpeg") return jpegInfo(bytes);
  if (container === "png" && bytes.length >= 24) return { width: view.getUint32(16, false), height: view.getUint32(20, false), orientation: 1 };
  if (container === "gif" && bytes.length >= 10) return { width: view.getUint16(6, true), height: view.getUint16(8, true), orientation: 1 };
  if (container === "webp" && bytes.length >= 30 && ascii(bytes, 12, 4) === "VP8X") return { width: 1 + bytes[24]! + (bytes[25]! << 8) + (bytes[26]! << 16), height: 1 + bytes[27]! + (bytes[28]! << 8) + (bytes[29]! << 16), orientation: 1 };
  throw new MediaError("CORRUPT_INPUT", "Image dimensions could not be read", "choose-another-file", { stage: "inspect" });
}

export type DecoderProbe = (metadata: Omit<MediaMetadata, "support">) => Promise<DecodeSupport>;
export async function browserDecoderProbe(metadata: Omit<MediaMetadata, "support">): Promise<DecodeSupport> {
  const codec = metadata.codecs[0];
  if (!codec) return metadata.kind === "image" ? "ready" : "unsupported";
  const mediaCapabilities = typeof navigator !== "undefined" ? navigator.mediaCapabilities : undefined;
  if (mediaCapabilities?.decodingInfo && (metadata.kind === "video" || metadata.kind === "audio")) {
    try {
      const config: MediaDecodingConfiguration = metadata.kind === "video"
        ? { type: "file", video: { contentType: `${metadata.mimeType}; codecs=\"${codec}\"`, width: metadata.displayWidth ?? 1, height: metadata.displayHeight ?? 1, bitrate: 1_000_000, framerate: 30 } }
        : { type: "file", audio: { contentType: `${metadata.mimeType}; codecs=\"${codec}\"`, channels: String(metadata.channels ?? 2), bitrate: 192_000, samplerate: metadata.sampleRate ?? 48_000 } };
      return (await mediaCapabilities.decodingInfo(config)).supported ? "ready" : "needs-proxy";
    } catch { /* conservative fallback */ }
  }
  return ["h264", "avc", "aac", "opus", "vorbis", "pcm", "vp8", "vp9", "mp3"].some((known) => codec.toLowerCase().includes(known)) ? "ready" : "needs-proxy";
}

export class BrowserMediaInspector implements MediaInspector {
  constructor(private readonly probe: DecoderProbe = browserDecoderProbe) {}
  async inspect(input: BinaryInput, signal?: AbortSignal): Promise<Result<MediaMetadata>> {
    try {
      if (signal?.aborted) throw new MediaError("IMPORT_INTERRUPTED", "Import was cancelled", "retry", { stage: "inspect" });
      const head = new Uint8Array(await input.slice(0, Math.min(input.size, 256 * 1024)).arrayBuffer());
      const detected = signature(head);
      if (!detected) throw new MediaError("UNSUPPORTED_SIGNATURE", "This file's contents are not a supported media type", "choose-another-file", { stage: "inspect" });
      if (detected.kind === "image") {
        const info = imageInfo(head, detected.container); const rotated = info.orientation >= 5;
        const core = { kind: "image" as const, container: detected.container, mimeType: detected.mimeType, codecs: [] as readonly string[], byteSize: input.size, codedWidth: info.width, codedHeight: info.height, displayWidth: rotated ? info.height : info.width, displayHeight: rotated ? info.width : info.height, orientation: info.orientation };
        return { ok: true, value: { ...core, support: await this.probe(core) } };
      }
      const blob = input instanceof Blob ? input : input.slice(0, input.size);
      const parsed = await parseMedia({ src: blob, acknowledgeRemotionLicense: true, fields: { durationInSeconds: true, dimensions: true, unrotatedDimensions: true, videoCodec: true, audioCodec: true, container: true, mimeType: true, rotation: true, sampleRate: true, numberOfAudioChannels: true, fps: true } });
      const kind = parsed.videoCodec ? "video" : parsed.audioCodec ? "audio" : null;
      if (!kind) throw new MediaError("UNSUPPORTED_CODEC", "No editable audio or video track was found", "transcode-and-retry", { stage: "inspect" });
      const codecs = [parsed.videoCodec, parsed.audioCodec].filter((value): value is NonNullable<typeof value> => Boolean(value)).map(String);
      const rotation = parsed.rotation ?? 0; const orientation = rotation === 90 ? 6 : rotation === 180 ? 3 : rotation === 270 ? 8 : 1;
      const core: Omit<MediaMetadata, "support"> = {
        kind, container: parsed.container, mimeType: parsed.mimeType ?? detected.mimeType, codecs, byteSize: input.size,
        ...(parsed.durationInSeconds === null ? {} : { durationUs: Math.max(0, Math.round(parsed.durationInSeconds * 1_000_000)), sourceStartUs: 0 }),
        ...(parsed.unrotatedDimensions ? { codedWidth: parsed.unrotatedDimensions.width, codedHeight: parsed.unrotatedDimensions.height } : {}),
        ...(parsed.dimensions ? { displayWidth: parsed.dimensions.width, displayHeight: parsed.dimensions.height } : {}),
        ...(orientation === 1 ? {} : { orientation: orientation as 3|6|8 }),
        ...(parsed.numberOfAudioChannels === null ? {} : { channels: parsed.numberOfAudioChannels }),
        ...(parsed.sampleRate === null ? {} : { sampleRate: parsed.sampleRate }),
        variableFrameRate: false,
      };
      return { ok: true, value: { ...core, support: await this.probe(core) } };
    } catch (cause) {
      const error = cause instanceof MediaError ? cause : new MediaError("CORRUPT_INPUT", "Media is damaged or incomplete", "choose-another-file", { stage: "inspect" }, cause);
      return { ok: false, error };
    }
  }
}
