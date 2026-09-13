import { assertValidProjectDoc, loadProjectDoc, type AssetRef, type ProjectDoc } from "@aurelius/project-model";
import { z } from "zod";
import { MediaError, type Result } from "./errors";
import type { ProjectService } from "./project-service";

const MAX_MANIFEST_BYTES = 5 * 1024 * 1024;
const ManifestAssetSchema = z.strictObject({ assetId: z.string().min(1), name: z.string().min(1).max(500), kind: z.enum(["video","image","audio"]), mimeType: z.string().min(1).max(160), byteSize: z.number().int().nonnegative().safe(), fingerprint: z.string().min(1).max(256), durationUs: z.number().int().nonnegative().safe().optional(), width: z.number().int().positive().safe().optional(), height: z.number().int().positive().safe().optional(), requiresRelink: z.literal(true) });
const ManifestSchema = z.strictObject({ format: z.literal("aurelius-project"), manifestVersion: z.literal(1), exportedAt: z.iso.datetime({ offset: true }), project: z.unknown(), assets: z.array(ManifestAssetSchema).max(10_000) });
export interface AureliusManifest { readonly format: "aurelius-project"; readonly manifestVersion: 1; readonly exportedAt: string; readonly project: ProjectDoc; readonly assets: readonly z.infer<typeof ManifestAssetSchema>[] }
export interface ManifestDownload { readonly filename: string; readonly mimeType: "application/json"; readonly content: string }

function safeFilename(title: string): string { return `${title.trim().replace(/[^a-zA-Z0-9._-]+/gu, "-").replace(/^-|-$/gu, "").slice(0, 80) || "aurelius-project"}.aurelius-project`; }
function manifestAsset(asset: AssetRef): AureliusManifest["assets"][number] { return { assetId: asset.id, name: asset.name, kind: asset.kind, mimeType: asset.mimeType, byteSize: asset.byteSize, fingerprint: asset.fingerprint, ...(asset.durationUs === undefined ? {} : { durationUs: asset.durationUs }), ...(asset.width === undefined ? {} : { width: asset.width }), ...(asset.height === undefined ? {} : { height: asset.height }), requiresRelink: true }; }

export function exportManifest(project: ProjectDoc, exportedAt: string): ManifestDownload {
  const parsed = assertValidProjectDoc(project);
  const manifest: AureliusManifest = { format: "aurelius-project", manifestVersion: 1, exportedAt, project: parsed, assets: parsed.assetOrder.map((id) => manifestAsset(parsed.assets[id]!)) };
  return { filename: safeFilename(parsed.title), mimeType: "application/json", content: JSON.stringify(manifest, null, 2) };
}

export function parseManifest(content: string): Result<AureliusManifest> {
  try {
    if (new TextEncoder().encode(content).byteLength > MAX_MANIFEST_BYTES) throw new MediaError("MANIFEST_INVALID", "Project manifest is too large", "choose-another-file");
    const raw = JSON.parse(content) as unknown;
    if (typeof raw === "object" && raw !== null && "manifestVersion" in raw && typeof raw.manifestVersion === "number" && raw.manifestVersion > 1) throw new MediaError("MANIFEST_NEWER", "This project needs a newer version of Aurelius", "update-app");
    const result = ManifestSchema.safeParse(raw); if (!result.success) throw new MediaError("MANIFEST_INVALID", "This is not a valid Aurelius project manifest", "choose-another-file", { issueCount: result.error.issues.length });
    const loaded = loadProjectDoc(result.data.project); if (!loaded.ok) throw new MediaError(loaded.error.code === "PROJECT_VERSION_TOO_NEW" ? "MANIFEST_NEWER" : "MANIFEST_INVALID", loaded.error.message, loaded.error.code === "PROJECT_VERSION_TOO_NEW" ? "update-app" : "choose-another-file", { diagnosticId: loaded.error.diagnosticId });
    return { ok: true, value: { format: "aurelius-project", manifestVersion: 1, exportedAt: result.data.exportedAt, project: loaded.value, assets: result.data.assets } };
  } catch (cause) { return { ok: false, error: cause instanceof MediaError ? cause : new MediaError("MANIFEST_INVALID", "Project manifest contains invalid JSON", "choose-another-file", {}, cause) }; }
}

export class ManifestService {
  constructor(private readonly projects: ProjectService, private readonly now: () => string = () => new Date().toISOString()) {}
  export(project: ProjectDoc): ManifestDownload { return exportManifest(project, this.now()); }
  async import(content: string): Promise<Result<ProjectDoc>> { const parsed = parseManifest(content); if (!parsed.ok) return parsed; try { return { ok: true, value: await this.projects.createFromDocument(parsed.value.project) }; } catch (cause) { return { ok: false, error: new MediaError("MANIFEST_INVALID", "Project could not be stored", "retry", {}, cause) }; } }
}
