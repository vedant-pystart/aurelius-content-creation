import { asProjectModelError, ProjectModelError } from "../errors";
import { CURRENT_SCHEMA_VERSION } from "../schema";
import { validateCurrentProjectDoc } from "../validation";
import type { LoadProjectResult, MigrationStep } from "./types";
import { migrateV1ToV2 } from "./v1-to-v2";
import { migrateV2ToV3 } from "./v2-to-v3";

const registry: ReadonlyMap<number, MigrationStep<number, number>> = new Map<number, MigrationStep<number, number>>([[1, migrateV1ToV2 as MigrationStep<number, number>], [2, migrateV2ToV3 as MigrationStep<number, number>]]);

function cloneJson(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value)) as unknown;
  } catch (error) {
    throw new ProjectModelError("MIGRATION_FAILED", "Project cannot be safely cloned as JSON", "restore-last-known-good-or-export-original", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

function readVersion(value: unknown): number | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const version = (value as Record<string, unknown>).schemaVersion;
  return Number.isSafeInteger(version) ? version as number : null;
}

export function loadProjectDoc(input: unknown): LoadProjectResult {
  const sourceVersion = readVersion(input);
  if (sourceVersion === null || sourceVersion < 1) {
    return { ok: false, error: new ProjectModelError("MIGRATION_FAILED", "Project schema version is missing or invalid", "restore-last-known-good-or-export-original", { sourceVersion }) };
  }
  if (sourceVersion > CURRENT_SCHEMA_VERSION) {
    return { ok: false, error: new ProjectModelError("PROJECT_VERSION_TOO_NEW", `Project version ${sourceVersion} requires a newer app`, "update-app", { sourceVersion, currentVersion: CURRENT_SCHEMA_VERSION }) };
  }
  try {
    let current = cloneJson(input);
    let version = sourceVersion;
    const applied: string[] = [];
    let steps = 0;
    while (version < CURRENT_SCHEMA_VERSION) {
      if (steps >= registry.size) throw new ProjectModelError("MIGRATION_FAILED", "Migration exceeded the registered step limit", "restore-last-known-good-or-export-original", { sourceVersion, failedVersion: version });
      const step = registry.get(version);
      if (!step || step.toVersion !== version + 1) throw new ProjectModelError("MIGRATION_FAILED", `No sequential migration is registered from version ${version}`, "restore-last-known-good-or-export-original", { sourceVersion, failedVersion: version });
      try {
        current = step.migrate(current);
      } catch (error) {
        const cause = asProjectModelError(error);
        throw new ProjectModelError("MIGRATION_FAILED", `Migration ${step.id} failed: ${cause.message}`, "restore-last-known-good-or-export-original", { sourceVersion, failedStep: step.id, causeCode: cause.code });
      }
      version = step.toVersion;
      applied.push(step.id);
      steps += 1;
      if (version === CURRENT_SCHEMA_VERSION) {
        const intermediate = validateCurrentProjectDoc(current);
        if (!intermediate.ok) throw new ProjectModelError("MIGRATION_FAILED", `Migration ${step.id} produced an invalid project`, "restore-last-known-good-or-export-original", { sourceVersion, failedStep: step.id, causeCode: intermediate.error.code }, intermediate.error.issues);
      }
    }
    const validated = validateCurrentProjectDoc(current);
    if (!validated.ok) return { ok: false, error: validated.error };
    return { ok: true, value: validated.value, report: { sourceVersion, targetVersion: CURRENT_SCHEMA_VERSION, appliedMigrations: applied } };
  } catch (error) {
    return { ok: false, error: asProjectModelError(error) };
  }
}

export const migrateProjectDoc = loadProjectDoc;
