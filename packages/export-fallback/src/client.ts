import type { BinaryStore } from "@aurelius/media";
import type { BackendArtifact, ConsentReceipt, FallbackManifest, FallbackStatus, ServerExportBackend } from "./contracts";

export interface FallbackClientState { readonly stage: FallbackStatus["stage"] | "idle"; readonly progress: number; readonly status?: FallbackStatus; readonly error?: string }
export class FallbackExportClient {
  private state: FallbackClientState = Object.freeze({ stage: "idle", progress: 0 }); private controller: AbortController | null = null; private activeJob: { readonly id: string; readonly grant: string } | null = null; private listeners = new Set<(state: FallbackClientState) => void>();
  constructor(private readonly backend: ServerExportBackend, private readonly binaryStore: BinaryStore) {}
  snapshot(): FallbackClientState { return this.state }
  subscribe(listener: (state: FallbackClientState) => void): () => void { this.listeners.add(listener); listener(this.state); return () => this.listeners.delete(listener); }
  private update(state: FallbackClientState) { this.state = Object.freeze(state); this.listeners.forEach((listener) => listener(this.state)); }
  async confirm(manifest: FallbackManifest, receipt: ConsentReceipt): Promise<BackendArtifact> {
    if (receipt.manifestHash !== manifest.manifestHash || receipt.policyVersion !== manifest.policyVersion) throw new Error("Re-open server export and review the latest disclosure.");
    await this.cancel(); const controller = new AbortController(); this.controller = controller; this.update({ stage: "consenting", progress: 0 });
    try {
      const grants = await this.backend.create(manifest, receipt, controller.signal); this.activeJob = { id: grants.jobId, grant: grants.job }; this.update({ stage: "uploading", progress: 0 });
      for (let index = 0; index < manifest.assets.length; index += 1) { const asset = manifest.assets[index]!; const source = await this.binaryStore.read(asset.sourcePath); if (source.size !== asset.byteSize) throw new Error("A source changed before upload."); const grant = grants.upload[asset.id]; if (!grant) throw new Error("The server did not grant this asset."); await this.backend.upload(grants.jobId, asset.id, grant, source, controller.signal); this.update({ stage: "uploading", progress: (index + 1) / manifest.assets.length }); }
      await this.backend.start(grants.jobId, grants.job, controller.signal);
      for (;;) { const status = await this.backend.status(grants.jobId, grants.job, controller.signal); this.update({ stage: status.stage, progress: status.progress, status }); if (status.stage === "ready") { if (!grants.result) throw new Error("The server did not issue a download grant."); return await this.backend.result(grants.jobId, grants.result, controller.signal); } if (["failed", "cancelled", "expired"].includes(status.stage)) throw new Error(status.reason ?? status.stage); await new Promise((resolve) => setTimeout(resolve, 250)); }
    } catch (error) { const message = error instanceof Error ? error.message : "Server export failed."; this.update({ stage: controller.signal.aborted ? "cancelled" : "failed", progress: this.state.progress, error: message }); throw error; } finally { this.activeJob = null; }
  }
  async cancel(): Promise<void> { const controller = this.controller; const job = this.activeJob; this.controller = null; this.activeJob = null; if (!controller && !job) return; controller?.abort(); if (job) await this.backend.cancel(job.id, job.grant).catch(() => undefined); this.update({ stage: "cancelled", progress: this.state.progress }); }
  dispose() { void this.cancel(); this.listeners.clear(); }
}
