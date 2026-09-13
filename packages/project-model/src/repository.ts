import { ProjectModelError } from "./errors";
import type { ProjectDoc } from "./model";
import { assertValidProjectDoc } from "./validation";

export interface ProjectSummary {
  readonly id: string;
  readonly title: string;
  readonly revision: number;
  readonly updatedAt: string;
}

export interface ProjectRepository {
  create(doc: ProjectDoc): Promise<ProjectDoc>;
  get(id: string): Promise<ProjectDoc | null>;
  list(): Promise<readonly ProjectSummary[]>;
  save(doc: ProjectDoc, expectedRevision: number): Promise<ProjectDoc>;
  delete(id: string): Promise<void>;
}

function cloneValidated(doc: ProjectDoc): ProjectDoc {
  return assertValidProjectDoc(JSON.parse(JSON.stringify(doc)) as unknown);
}

export class InMemoryProjectRepository implements ProjectRepository {
  readonly #projects = new Map<string, ProjectDoc>();

  async create(input: ProjectDoc): Promise<ProjectDoc> {
    const doc = cloneValidated(input);
    if (this.#projects.has(doc.id)) throw new ProjectModelError("PROJECT_ALREADY_EXISTS", `Project ${doc.id} already exists`, "choose-another-project", { projectId: doc.id });
    this.#projects.set(doc.id, cloneValidated(doc));
    return cloneValidated(doc);
  }

  async get(id: string): Promise<ProjectDoc | null> {
    const doc = this.#projects.get(id);
    return doc ? cloneValidated(doc) : null;
  }

  async list(): Promise<readonly ProjectSummary[]> {
    return [...this.#projects.values()]
      .map(({ id, title, revision, updatedAt }) => ({ id, title, revision, updatedAt }))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id));
  }

  async save(input: ProjectDoc, expectedRevision: number): Promise<ProjectDoc> {
    const doc = cloneValidated(input);
    const current = this.#projects.get(doc.id);
    if (!current) throw new ProjectModelError("PROJECT_NOT_FOUND", `Project ${doc.id} does not exist`, "choose-another-project", { projectId: doc.id });
    if (current.revision !== expectedRevision || doc.revision !== expectedRevision + 1) {
      throw new ProjectModelError("STALE_REVISION", `Project ${doc.id} changed since revision ${expectedRevision}`, "reload-latest-project", { expectedRevision, actualRevision: current.revision, proposedRevision: doc.revision });
    }
    this.#projects.set(doc.id, cloneValidated(doc));
    return cloneValidated(doc);
  }

  async delete(id: string): Promise<void> {
    if (!this.#projects.delete(id)) throw new ProjectModelError("PROJECT_NOT_FOUND", `Project ${id} does not exist`, "choose-another-project", { projectId: id });
  }
}
