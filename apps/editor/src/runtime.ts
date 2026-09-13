import { AureliusDatabase, AutosaveCoordinator, BrowserMediaInspector, BrowserStoragePolicy, BrowserThumbnailGenerator, DexieMediaRepository, DexieProjectRepository, ManifestService, MediaIngestService, MediaResourceManager, OpfsBinaryStore, ProjectService, RelinkService, createBrowserOwnership, type BinaryStore, type ProjectOwnership, type StoragePolicy } from "@aurelius/media";
import type { ProjectDoc } from "@aurelius/project-model";

export interface AppRuntime {
  readonly db: AureliusDatabase;
  readonly projects: DexieProjectRepository;
  readonly media: DexieMediaRepository;
  readonly projectService: ProjectService;
  readonly store: BinaryStore;
  readonly storage: StoragePolicy;
  readonly ingest: MediaIngestService;
  readonly resources: MediaResourceManager;
  readonly manifest: ManifestService;
  readonly relink: RelinkService;
  readonly ownership: ProjectOwnership;
  createAutosave(project: ProjectDoc): AutosaveCoordinator;
  dispose(): Promise<void>;
}

export function createBrowserRuntime(): AppRuntime {
  const db = new AureliusDatabase(); const projects = new DexieProjectRepository(db); const media = new DexieMediaRepository(db); const projectService = new ProjectService(projects);
  const store = new OpfsBinaryStore(); const storage = new BrowserStoragePolicy(navigator.storage); const inspector = new BrowserMediaInspector(); const thumbnails = new BrowserThumbnailGenerator();
  const ingest = new MediaIngestService(storage,store,inspector,thumbnails,media); const resources = new MediaResourceManager(store); const manifest = new ManifestService(projectService); const relink = new RelinkService(projects,media,store,storage,inspector,thumbnails); const ownership = createBrowserOwnership();
  return { db,projects,media,projectService,store,storage,ingest,resources,manifest,relink,ownership,createAutosave:(project)=>new AutosaveCoordinator(projects,project.id,project.revision),dispose:async()=>{resources.dispose();await ownership.dispose();db.close();} };
}

let singleton: AppRuntime | undefined;
export function browserRuntime(): AppRuntime { singleton ??= createBrowserRuntime(); return singleton; }
