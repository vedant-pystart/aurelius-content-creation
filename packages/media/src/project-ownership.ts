export type OwnershipStatus =
  | { readonly mode: "owner"; readonly writable: true; readonly reducedProtection: false }
  | { readonly mode: "read-only"; readonly writable: false; readonly reducedProtection: false }
  | { readonly mode: "unprotected"; readonly writable: true; readonly reducedProtection: true };

export interface LockPort { request(name: string, options: { mode: "exclusive"; ifAvailable?: boolean; steal?: boolean; signal?: AbortSignal }, callback: (lock: object | null) => Promise<void>): Promise<void> }
export interface BroadcastPort { postMessage(value: unknown): void; addEventListener(type: "message", listener: (event: MessageEvent) => void): void; removeEventListener(type: "message", listener: (event: MessageEvent) => void): void; close(): void }
export interface OwnershipMessage { readonly type: "owner" | "released" | "revision"; readonly projectId: string; readonly ownerId: string; readonly revision?: number }

export class ProjectOwnership {
  private status: OwnershipStatus;
  private projectId: string | null = null;
  private releaseHold: (() => void) | null = null;
  private channel: BroadcastPort | null = null;
  private readonly listeners = new Set<(status: OwnershipStatus) => void>();
  private disposed = false;
  private generation = 0;
  constructor(private readonly locks?: LockPort, private readonly channelFactory?: (name: string) => BroadcastPort, private readonly ownerId: string = crypto.randomUUID()) {
    this.status = locks ? { mode: "read-only", writable: false, reducedProtection: false } : { mode: "unprotected", writable: true, reducedProtection: true };
  }
  get snapshot(): OwnershipStatus { return this.status; }
  subscribe(listener: (status: OwnershipStatus) => void): () => void { this.listeners.add(listener); listener(this.status); return () => this.listeners.delete(listener); }
  private emit(status: OwnershipStatus): void { this.status = status; for (const listener of this.listeners) listener(status); }
  private readonly onMessage = (event: MessageEvent) => { const message = event.data as Partial<OwnershipMessage>; if (message.projectId !== this.projectId || message.ownerId === this.ownerId) return; if (message.type === "owner" && this.status.mode !== "owner") this.emit({ mode: "read-only", writable: false, reducedProtection: false }); };

  async acquire(projectId: string): Promise<OwnershipStatus> {
    await this.release(); this.disposed = false; this.projectId = projectId; const generation = ++this.generation;
    this.channel = this.channelFactory?.(`aurelius:project:${projectId}`) ?? null; this.channel?.addEventListener("message", this.onMessage);
    if (!this.locks) { this.emit({ mode: "unprotected", writable: true, reducedProtection: true }); return this.status; }
    let resolveOutcome!: (status: OwnershipStatus) => void;
    const outcome = new Promise<OwnershipStatus>((resolve) => { resolveOutcome = resolve; });
    void this.locks.request(`aurelius:project:${projectId}`, { mode: "exclusive", ifAvailable: true }, async (lock) => {
      if (this.disposed || generation !== this.generation) return;
      if (!lock) { const status = { mode: "read-only", writable: false, reducedProtection: false } as const; this.emit(status); resolveOutcome(status); return; }
      const status = { mode: "owner", writable: true, reducedProtection: false } as const; this.emit(status); this.channel?.postMessage({ type: "owner", projectId, ownerId: this.ownerId } satisfies OwnershipMessage); resolveOutcome(status);
      await new Promise<void>((resolve) => { this.releaseHold = resolve; });
    }).catch(() => {
      if (this.disposed || generation !== this.generation) return;
      const status = { mode: "read-only", writable: false, reducedProtection: false } as const;
      this.emit(status);
      resolveOutcome(status);
    });
    return outcome;
  }
  announceRevision(revision: number): void { if (this.projectId) this.channel?.postMessage({ type: "revision", projectId: this.projectId, ownerId: this.ownerId, revision } satisfies OwnershipMessage); }
  async takeOver(): Promise<OwnershipStatus> {
    if (!this.locks || !this.projectId) return this.status;
    const projectId = this.projectId; await this.release(); this.projectId = projectId;
    let resolveOutcome!: (status: OwnershipStatus) => void; const outcome = new Promise<OwnershipStatus>((resolve) => { resolveOutcome = resolve; });
    void this.locks.request(`aurelius:project:${projectId}`, { mode: "exclusive", steal: true }, async (lock) => { if (!lock) return; const status = { mode: "owner", writable: true, reducedProtection: false } as const; this.emit(status); resolveOutcome(status); await new Promise<void>((resolve) => { this.releaseHold = resolve; }); });
    return outcome;
  }
  async release(): Promise<void> { this.disposed = true; ++this.generation; this.releaseHold?.(); this.releaseHold = null; if (this.projectId) this.channel?.postMessage({ type: "released", projectId: this.projectId, ownerId: this.ownerId } satisfies OwnershipMessage); this.channel?.removeEventListener("message", this.onMessage); this.channel?.close(); this.channel = null; this.projectId = null; }
  async dispose(): Promise<void> { await this.release(); this.listeners.clear(); }
}

export function createBrowserOwnership(): ProjectOwnership {
  const locks = typeof navigator !== "undefined" ? navigator.locks as unknown as LockPort : undefined;
  return new ProjectOwnership(locks, typeof BroadcastChannel === "undefined" ? undefined : (name) => new BroadcastChannel(name));
}
