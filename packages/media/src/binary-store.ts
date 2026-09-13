import { MediaError } from "./errors";
import type { BinaryInput, BinaryStore } from "./types";

const ALLOWED = /^aurelius\/(?:imports\/[A-Za-z0-9._-]+\.partial|assets\/[A-Za-z0-9._-]+\/(?:original|poster\.webp|proxy\.mp4|waveform\.bin)|exports\/[A-Za-z0-9-]{8,128}\.(?:partial|mp4))$/;

export function assertSafeBinaryPath(path: string): string {
  if (!ALLOWED.test(path) || path.includes("..") || path.startsWith("/")) {
    throw new MediaError("STORAGE_UNAVAILABLE", "Unsafe media storage path was rejected", "retry", { stage: "path" });
  }
  return path;
}

async function readStream(input: BinaryInput, signal?: AbortSignal, onBytes?: (bytes: number) => void): Promise<Uint8Array> {
  const reader = input.stream().getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      if (signal?.aborted) throw new MediaError("IMPORT_INTERRUPTED", "Import was cancelled", "retry", { stage: "copy" });
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
      if (total > input.size) throw new MediaError("CORRUPT_INPUT", "Media stream exceeded its declared size", "choose-another-file", { stage: "copy" });
      onBytes?.(total);
    }
  } finally { reader.releaseLock(); }
  if (total !== input.size) throw new MediaError("CORRUPT_INPUT", "Media copy ended before the declared size", "choose-another-file", { stage: "copy", expected: input.size, actual: total });
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export class InMemoryBinaryStore implements BinaryStore {
  readonly files = new Map<string, Uint8Array>();
  async writePartial(path: string, input: BinaryInput, signal?: AbortSignal, onBytes?: (bytes: number) => void): Promise<void> {
    assertSafeBinaryPath(path);
    try { this.files.set(path, await readStream(input, signal, onBytes)); }
    catch (error) { this.files.delete(path); throw error; }
  }
  async write(path: string, blob: Blob, signal?: AbortSignal): Promise<void> { assertSafeBinaryPath(path); if (signal?.aborted) throw new MediaError("IMPORT_INTERRUPTED", "Import was cancelled", "retry"); this.files.set(path, new Uint8Array(await blob.arrayBuffer())); }
  async promote(partialPath: string, finalPath: string, expectedBytes: number): Promise<void> {
    assertSafeBinaryPath(partialPath); assertSafeBinaryPath(finalPath);
    const source = this.files.get(partialPath);
    if (!source || source.byteLength !== expectedBytes) throw new MediaError("CORRUPT_INPUT", "Staged media could not be verified", "retry", { stage: "promote" });
    this.files.set(finalPath, source.slice());
    if (this.files.get(finalPath)?.byteLength !== expectedBytes) throw new MediaError("CORRUPT_INPUT", "Promoted media could not be verified", "retry", { stage: "promote" });
    this.files.delete(partialPath);
  }
  async read(path: string): Promise<Blob> {
    assertSafeBinaryPath(path); const bytes = this.files.get(path);
    if (!bytes) throw new MediaError("MISSING_SOURCE", "Local source media is missing", "relink-source", { stage: "read" });
    return new Blob([bytes.slice().buffer]);
  }
  async exists(path: string): Promise<boolean> { assertSafeBinaryPath(path); return this.files.has(path); }
  async size(path: string): Promise<number | null> { assertSafeBinaryPath(path); return this.files.get(path)?.byteLength ?? null; }
  async delete(path: string): Promise<void> { assertSafeBinaryPath(path); this.files.delete(path); }
  async listPartials(): Promise<readonly string[]> { return [...this.files.keys()].filter((path) => path.startsWith("aurelius/imports/")).sort(); }
  async cleanupPartials(): Promise<number> { const paths = await this.listPartials(); paths.forEach((path) => this.files.delete(path)); return paths.length; }
}
