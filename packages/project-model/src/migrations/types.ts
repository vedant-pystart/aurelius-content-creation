import type { ProjectDoc } from "../model";
import type { ProjectModelError } from "../errors";

export interface MigrationStep<From extends number, To extends number> {
  readonly fromVersion: From;
  readonly toVersion: To;
  readonly id: `v${From}-to-v${To}`;
  readonly migrate: (input: unknown) => unknown;
}

export interface MigrationReport {
  readonly sourceVersion: number;
  readonly targetVersion: 3;
  readonly appliedMigrations: readonly string[];
}

export type LoadProjectResult =
  | { readonly ok: true; readonly value: ProjectDoc; readonly report: MigrationReport }
  | { readonly ok: false; readonly error: ProjectModelError };
