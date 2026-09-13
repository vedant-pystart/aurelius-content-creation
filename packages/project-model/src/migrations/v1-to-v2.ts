import { ProjectModelError } from "../errors";
import type { MigrationStep } from "./types";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const migrateV1ToV2: MigrationStep<1, 2> = {
  fromVersion: 1,
  toVersion: 2,
  id: "v1-to-v2",
  migrate(input) {
    if (!isObject(input) || !isObject(input.composition)) {
      throw new ProjectModelError("MIGRATION_FAILED", "Version 1 composition is missing", "restore-last-known-good-or-export-original", { fromVersion: 1, toVersion: 2 });
    }
    const fps = input.composition.fps;
    if (fps !== 24 && fps !== 30 && fps !== 60) {
      throw new ProjectModelError("MIGRATION_FAILED", "Version 1 frame rate is unsupported", "restore-last-known-good-or-export-original", { fromVersion: 1, toVersion: 2, fps });
    }
    const { fps: _removedFps, ...composition } = input.composition;
    return {
      ...input,
      schemaVersion: 2,
      composition: { ...composition, frameRate: { numerator: fps, denominator: 1 } },
    };
  },
};
