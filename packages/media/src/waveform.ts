import type { BinaryStore } from "./types";

const MAGIC = [65, 85, 82, 87] as const; // AURW
export const WAVEFORM_VERSION = 1;
export interface WaveformEnvelope { readonly version: 1; readonly sampleCount: number; readonly peaks: readonly number[] }
export interface AudioDecoder { decode(blob: Blob): Promise<readonly Float32Array[]> }
const pathFor = (assetId: string) => `aurelius/assets/${assetId}/waveform.bin`;

export function deriveWaveform(samples: readonly Float32Array[], requestedBuckets = 160): WaveformEnvelope {
  const total = samples.reduce((sum, channel) => sum + channel.length, 0); const bucketCount = Math.max(16, Math.min(1024, Math.min(requestedBuckets, Math.max(16, Math.ceil(total / 64))))); const peaks = new Array<number>(bucketCount).fill(0);
  for (const channel of samples) for (let index = 0; index < channel.length; index += 1) { const bucket = Math.min(bucketCount - 1, Math.floor(index / Math.max(1, channel.length) * bucketCount)); peaks[bucket] = Math.max(peaks[bucket]!, Math.min(1, Math.abs(channel[index] ?? 0))); }
  return { version: 1, sampleCount: total, peaks };
}
export function encodeWaveform(envelope: WaveformEnvelope): Blob { const bytes = new Uint8Array(12 + envelope.peaks.length); bytes.set(MAGIC, 0); bytes[4] = WAVEFORM_VERSION; new DataView(bytes.buffer).setUint32(5, envelope.sampleCount); new DataView(bytes.buffer).setUint16(9, envelope.peaks.length); envelope.peaks.forEach((peak, index) => { bytes[11 + index] = Math.round(Math.max(0, Math.min(1, peak)) * 255); }); return new Blob([bytes], { type: "application/octet-stream" }); }
export async function decodeWaveform(blob: Blob): Promise<WaveformEnvelope | undefined> { const bytes = new Uint8Array(await blob.arrayBuffer()); if (bytes.length < 12 || !MAGIC.every((value, index) => bytes[index] === value) || bytes[4] !== WAVEFORM_VERSION) return undefined; const view = new DataView(bytes.buffer); const sampleCount = view.getUint32(5); const count = view.getUint16(9); if (count < 16 || count > 1024 || bytes.length !== 11 + count) return undefined; return { version: 1, sampleCount, peaks: Array.from(bytes.slice(11), (value) => value / 255) }; }
export class WaveformService {
  constructor(private readonly store: BinaryStore, private readonly decoder: AudioDecoder) {}
  async get(assetId: string, sourcePath: string): Promise<WaveformEnvelope> { const path = pathFor(assetId); if (await this.store.exists(path)) { const cached = await decodeWaveform(await this.store.read(path)); if (cached) return cached; await this.store.delete(path); } const envelope = deriveWaveform(await this.decoder.decode(await this.store.read(sourcePath))); await this.store.write(path, encodeWaveform(envelope)); return envelope; }
}
