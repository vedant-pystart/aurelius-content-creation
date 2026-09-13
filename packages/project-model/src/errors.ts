export type ProjectErrorCode =
  | "MALFORMED_PROJECT"
  | "PROJECT_INVARIANT_VIOLATION"
  | "PROJECT_VERSION_TOO_NEW"
  | "MIGRATION_FAILED"
  | "STALE_REVISION"
  | "COMMAND_REJECTED"
  | "PROJECT_NOT_FOUND"
  | "PROJECT_ALREADY_EXISTS";

export type RecoveryAction =
  | "fix-or-relink-project-data"
  | "update-app"
  | "restore-last-known-good-or-export-original"
  | "reload-latest-project"
  | "revise-edit"
  | "choose-another-project";

export interface ProjectIssue {
  readonly code: string;
  readonly message: string;
  readonly path: string;
  readonly entityId?: string;
}

export class ProjectModelError extends Error {
  readonly diagnosticId: string;

  constructor(
    readonly code: ProjectErrorCode,
    message: string,
    readonly recoveryAction: RecoveryAction,
    readonly details: Readonly<Record<string, unknown>> = {},
    readonly issues: readonly ProjectIssue[] = [],
  ) {
    super(message);
    this.name = "ProjectModelError";
    const firstPath = issues[0]?.path ?? "root";
    this.diagnosticId = `${code}:${firstPath}`;
  }
}

export function asProjectModelError(error: unknown): ProjectModelError {
  return error instanceof ProjectModelError
    ? error
    : new ProjectModelError("MALFORMED_PROJECT", "Project data could not be read", "fix-or-relink-project-data", {
        cause: error instanceof Error ? error.message : String(error),
      });
}
