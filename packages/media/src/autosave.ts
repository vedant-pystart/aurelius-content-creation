import type { ProjectDoc, ProjectRepository } from "@aurelius/project-model";
import { MediaError, asMediaError } from "./errors";

export type AutosaveState =
  | { readonly status: "idle"; readonly projectId: string; readonly revision: number }
  | { readonly status: "saving"; readonly projectId: string; readonly revision: number }
  | { readonly status: "saved"; readonly projectId: string; readonly revision: number; readonly savedAt: string }
  | { readonly status: "error"; readonly projectId: string; readonly revision: number; readonly error: MediaError }
  | { readonly status: "recovery"; readonly projectId: string; readonly revision: number; readonly error: MediaError };

export interface AutosaveScheduler { set(delayMs: number, callback: () => void): unknown; clear(handle: unknown): void }
const browserScheduler: AutosaveScheduler = { set: (delay, callback) => setTimeout(callback, delay), clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>) };

export class AutosaveCoordinator {
  private queue: ProjectDoc[] = [];
  private processing: Promise<void> | null = null;
  private timer: unknown;
  private disposed = false;
  private failed: ProjectDoc | null = null;
  private lastPersistedRevision: number;
  private state: AutosaveState;
  private readonly listeners = new Set<(state: AutosaveState) => void>();

  constructor(private readonly repository: ProjectRepository, readonly projectId: string, initialRevision: number, private readonly scheduler: AutosaveScheduler = browserScheduler, private readonly debounceMs = 180) {
    this.lastPersistedRevision = initialRevision;
    this.state = { status: "idle", projectId, revision: initialRevision };
  }
  get snapshot(): AutosaveState { return this.state; }
  subscribe(listener: (state: AutosaveState) => void): () => void { this.listeners.add(listener); listener(this.state); return () => this.listeners.delete(listener); }
  private emit(state: AutosaveState): void { this.state = state; for (const listener of this.listeners) listener(state); }

  submit(input: ProjectDoc): void {
    if (this.disposed || input.id !== this.projectId) return;
    const doc = structuredClone(input);
    const highest = this.queue.at(-1)?.revision ?? this.failed?.revision ?? this.lastPersistedRevision;
    if (doc.revision <= highest) return;
    if (doc.revision !== highest + 1) {
      this.emit({ status: "recovery", projectId: this.projectId, revision: doc.revision, error: new MediaError("STALE_PROJECT", "An edit revision is missing; reload the latest saved project", "reload-latest-project", { expectedRevision: highest + 1, proposedRevision: doc.revision }) });
      return;
    }
    this.queue.push(doc);
    if (!this.processing && this.timer === undefined) this.timer = this.scheduler.set(this.debounceMs, () => { this.timer = undefined; void this.drain(); });
  }

  private async drain(): Promise<void> {
    if (this.processing) return this.processing;
    this.processing = (async () => {
      while (this.queue.length) {
        const doc = this.queue[0]!;
        if (doc.revision !== this.lastPersistedRevision + 1) {
          this.emit({ status: "recovery", projectId: this.projectId, revision: doc.revision, error: new MediaError("STALE_PROJECT", "Autosave revisions are out of order", "reload-latest-project") });
          break;
        }
        this.emit({ status: "saving", projectId: this.projectId, revision: doc.revision });
        try {
          await this.repository.save(doc, this.lastPersistedRevision);
          this.lastPersistedRevision = doc.revision; this.queue.shift(); this.failed = null;
          this.emit({ status: "saved", projectId: this.projectId, revision: doc.revision, savedAt: doc.updatedAt });
        } catch (cause) {
          const error = asMediaError(cause, "Autosave failed"); this.failed = doc;
          this.emit({ status: error.code === "STALE_PROJECT" ? "recovery" : "error", projectId: this.projectId, revision: doc.revision, error });
          break;
        }
      }
    })().finally(() => { this.processing = null; });
    return this.processing;
  }

  async retry(): Promise<void> { if (this.failed && this.queue[0]?.revision !== this.failed.revision) this.queue.unshift(this.failed); this.failed = null; await this.flush(); }
  /**
   * Adopt a document persisted by an atomic service such as media relinking.
   * That service has already saved the canonical project revision alongside its
   * media registry transaction, so replaying it through autosave would produce
   * a false stale-write recovery state.
   */
  adoptPersisted(doc: ProjectDoc): void {
    if (doc.id !== this.projectId || doc.revision < this.lastPersistedRevision) return;
    this.queue = this.queue.filter((queued) => queued.revision > doc.revision);
    this.failed = null;
    this.lastPersistedRevision = doc.revision;
    this.emit({ status: "saved", projectId: this.projectId, revision: doc.revision, savedAt: doc.updatedAt });
  }
  async restoreLatest(): Promise<ProjectDoc | null> { this.queue = []; this.failed = null; const current = await this.repository.get(this.projectId); if (current) { this.lastPersistedRevision = current.revision; this.emit({ status: "idle", projectId: this.projectId, revision: current.revision }); } return current; }
  async flush(): Promise<void> { if (this.timer !== undefined) { this.scheduler.clear(this.timer); this.timer = undefined; } await this.drain(); if (this.processing) await this.processing; }
  async dispose(): Promise<void> { if (this.disposed) return; if (this.timer !== undefined) { this.scheduler.clear(this.timer); this.timer = undefined; } await this.flush(); this.disposed = true; this.listeners.clear(); }
}
