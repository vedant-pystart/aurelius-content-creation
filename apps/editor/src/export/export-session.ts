import { ExportArtifactStore, type BinaryStore, type MediaRepository, type MediaResourceManager } from "@aurelius/media";
import { BrowserArtifactProbe, RemotionBrowserExportRenderer, createBrowserPreflightAdapter, freezeRenderSnapshot, runExportPreflight, validateArtifact, type ExportArtifactDescriptor, type ExportJobState, type ExportPreflightReport, type ExportQuality, type ExportScope, type RenderSnapshot } from "@aurelius/export";
import type { ProjectDoc } from "@aurelius/project-model";

export interface ExportSessionState { readonly snapshot?: RenderSnapshot; readonly preflight?: ExportPreflightReport; readonly job: ExportJobState }
export class ExportSession {
  private state: ExportSessionState = Object.freeze({ job: { stage: "idle" as const, progress: 0, detail: "Ready to export." } }); private listeners = new Set<(state: ExportSessionState) => void>(); private aborter: AbortController | null = null;
  constructor(private readonly media: MediaRepository, private readonly store: BinaryStore, private readonly resources: MediaResourceManager) {}
  snapshot() { return this.state }
  subscribe(listener: (state: ExportSessionState) => void) { this.listeners.add(listener); listener(this.state); return () => this.listeners.delete(listener); }
  private update(next: ExportSessionState) { this.state = Object.freeze(next); this.listeners.forEach((listener) => listener(this.state)); }
  async preflight(project: ProjectDoc, scope: ExportScope = { kind: "project" }): Promise<ExportPreflightReport> {
    const snapshot = freezeRenderSnapshot(project, scope, project.revision); this.update({ snapshot, job: { stage: "preflighting", progress: 0, detail: "Checking this browser for an MP4 export…" } });
    const report = await runExportPreflight(snapshot, createBrowserPreflightAdapter({ get: async (id) => { const asset = await this.media.get(id); return asset ? { state: asset.state, fingerprint: asset.fingerprint, decode: asset.support === "ready" ? "ready" : "unsupported" } : null; } }));
    this.update({ snapshot, preflight: report, job: { stage: report.canRenderLocally ? "ready" : "failed", progress: 0, detail: report.canRenderLocally ? "Local H.264 MP4 export is ready." : "Local MP4 export needs attention." } }); return report;
  }
  async start(project: ProjectDoc, quality: ExportQuality, scope: ExportScope = { kind: "project" }): Promise<ExportArtifactDescriptor> {
    const report = await this.preflight(project, scope); const snapshot = this.state.snapshot!; if (!report.canRenderLocally) throw new Error("Resolve the blocking export checks before starting a local MP4.");
    await this.cancel(); const aborter = new AbortController(); this.aborter = aborter; const artifactStore = new ExportArtifactStore(this.store); const candidate = await artifactStore.createPartial(snapshot.jobId); const leases: { release(): void }[] = [];
    try {
      const renderer = new RemotionBrowserExportRenderer(); const artifact = await renderer.render(snapshot, candidate, { resolve: async (assetId) => { const asset = await this.media.get(assetId); if (!asset || asset.state !== "ready") throw new Error("A referenced asset is no longer ready."); const lease = await this.resources.acquire(asset.id, asset.fingerprint, asset.sourcePath); leases.push(lease); return lease.url; } }, { quality, signal: aborter.signal, onProgress: (stage, progress) => this.update({ snapshot, preflight: report, job: { stage, progress, detail: stage === "rendering" ? "Rendering exact output frames…" : "Finishing the MP4…" } }) });
      this.update({ snapshot, preflight: report, job: { stage: "validating", progress: 1, detail: "Validating the finished MP4…" } }); const validation = await validateArtifact(snapshot, artifact, new BrowserArtifactProbe(() => artifactStore.readPartial(candidate), snapshot.frameRate)); if (!validation.valid) { await candidate.abort(); throw new Error(validation.failure.message); }
      await artifactStore.promote(candidate, artifact.size); this.update({ snapshot, preflight: report, job: { stage: "completed", progress: 1, detail: "Your H.264 MP4 is ready.", artifact } }); return artifact;
    } catch (cause) { await candidate.abort(); const cancelled = aborter.signal.aborted; this.update({ snapshot, preflight: report, job: { stage: cancelled ? "cancelled" : "failed", progress: 0, detail: cancelled ? "Export cancelled." : "The MP4 export could not finish.", error: { code: cancelled ? "cancelled" : "render-failed", message: cause instanceof Error ? cause.message : "Export failed.", recovery: "retry" } } }); throw cause; } finally { leases.forEach((lease) => lease.release()); if (this.aborter === aborter) this.aborter = null; }
  }
  async download(): Promise<void> { const artifact = this.state.job.artifact; if (!artifact || this.state.job.stage !== "completed") throw new Error("No validated export is ready to download."); const blob = await new ExportArtifactStore(this.store).readFinal(artifact.id); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = artifact.filename; anchor.click(); queueMicrotask(() => URL.revokeObjectURL(url)); }
  async cancel(): Promise<void> { this.aborter?.abort(); }
  dispose() { void this.cancel(); this.listeners.clear(); }
}
