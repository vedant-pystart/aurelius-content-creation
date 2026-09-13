import { createProjectDoc, executeCommand, type AspectHeight, type FrameRate, type ProjectDoc, type ProjectRepository, type ProjectSummary } from "@aurelius/project-model";

export interface CreateLocalProjectInput { readonly title: string; readonly height?: AspectHeight; readonly frameRate?: FrameRate }
export interface DeleteProjectResult { readonly unreferencedAssetIds: readonly string[] }

export class ProjectService {
  constructor(
    private readonly repository: ProjectRepository,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly createId: () => string = () => crypto.randomUUID(),
  ) {}

  list(): Promise<readonly ProjectSummary[]> { return this.repository.list(); }
  open(id: string): Promise<ProjectDoc | null> { return this.repository.get(id); }

  async create(input: CreateLocalProjectInput): Promise<ProjectDoc> {
    const doc = createProjectDoc({ id: `project-${this.createId()}`, title: input.title.trim() || "Untitled Aurelius Film", width: 1080, height: input.height ?? 1920, frameRate: input.frameRate ?? { numerator: 30, denominator: 1 }, nowIso: this.now(), createId: this.createId });
    return this.repository.create(doc);
  }

  async rename(id: string, title: string): Promise<ProjectDoc> {
    const current = await this.require(id);
    const { nextDoc } = executeCommand(current, { type: "project/rename", expectedRevision: current.revision, title }, { committedAtIso: this.now() });
    return this.repository.save(nextDoc, current.revision);
  }

  async duplicate(id: string, title?: string): Promise<ProjectDoc> {
    const source = await this.require(id);
    const now = this.now();
    const copy = structuredClone(source) as ProjectDoc;
    const duplicated = { ...copy, id: `project-${this.createId()}`, title: title?.trim() || `${source.title} — Copy`, revision: 0, createdAt: now, updatedAt: now } satisfies ProjectDoc;
    return this.repository.create(duplicated);
  }

  async createFromDocument(source: ProjectDoc, title?: string): Promise<ProjectDoc> {
    const now = this.now(); const existing = await this.repository.get(source.id);
    const copy = structuredClone(source) as ProjectDoc;
    const imported = { ...copy, id: existing ? `project-${this.createId()}` : copy.id, title: title?.trim() || (existing ? `${copy.title} — Imported` : copy.title), revision: 0, createdAt: now, updatedAt: now } satisfies ProjectDoc;
    return this.repository.create(imported);
  }

  async delete(id: string): Promise<DeleteProjectResult> {
    const source = await this.require(id);
    const others = await this.repository.list();
    const referencedElsewhere = new Set<string>();
    for (const summary of others) {
      if (summary.id === id) continue;
      const other = await this.repository.get(summary.id);
      other?.assetOrder.forEach((assetId) => referencedElsewhere.add(assetId));
    }
    await this.repository.delete(id);
    return { unreferencedAssetIds: source.assetOrder.filter((assetId) => !referencedElsewhere.has(assetId)) };
  }

  private async require(id: string): Promise<ProjectDoc> {
    const project = await this.repository.get(id);
    if (!project) throw new Error(`Project ${id} was not found`);
    return project;
  }
}
