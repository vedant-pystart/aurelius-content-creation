import type { BinaryStore } from "./types";

export interface ExportArtifactCandidate { readonly id: string; readonly partialPath: string; readonly finalPath: string; readonly writable: WritableStream<Uint8Array>; close(): Promise<number>; abort(): Promise<void>; }
export interface StoredExportArtifact { readonly id: string; readonly path: string; readonly size: number }

/**
 * Export files have a deliberately separate namespace: cancellation can never
 * delete a creator's imported source or a previously promoted export.
 */
export class ExportArtifactStore {
  constructor(private readonly store: BinaryStore) {}

  async createPartial(jobId: string): Promise<ExportArtifactCandidate> {
    if (!/^[A-Za-z0-9-]{8,128}$/.test(jobId)) throw new RangeError("Invalid export job identifier");
    const partialPath = `aurelius/exports/${jobId}.partial`;
    const finalPath = `aurelius/exports/${jobId}.mp4`;
    const chunks: Uint8Array[] = [];
    let closed = false;
    const writable = new WritableStream<Uint8Array>({ write(chunk) { chunks.push(chunk.slice()); } });
    return {
      id: jobId, partialPath, finalPath, writable,
      close: async () => { if (closed) return (await this.store.size(partialPath)) ?? 0; closed = true; const parts = chunks.map((chunk) => chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer); const blob = new Blob(parts, { type: "video/mp4" }); await this.store.write(partialPath, blob); return blob.size; },
      abort: async () => { closed = true; chunks.length = 0; await this.store.delete(partialPath); },
    };
  }

  async promote(candidate: ExportArtifactCandidate, expectedBytes: number): Promise<StoredExportArtifact> {
    await candidate.close();
    await this.store.promote(candidate.partialPath, candidate.finalPath, expectedBytes);
    return Object.freeze({ id: candidate.id, path: candidate.finalPath, size: expectedBytes });
  }

  async readPartial(candidate: Pick<ExportArtifactCandidate, "partialPath">): Promise<Blob> { return this.store.read(candidate.partialPath); }
  async readFinal(id: string): Promise<Blob> { return this.store.read(`aurelius/exports/${id}.mp4`); }

  async deletePartial(candidate: Pick<ExportArtifactCandidate, "partialPath" | "abort">): Promise<void> { await candidate.abort(); }
  async deleteFinal(id: string): Promise<void> { await this.store.delete(`aurelius/exports/${id}.mp4`); }
}
