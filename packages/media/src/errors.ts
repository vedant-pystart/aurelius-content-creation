export type MediaRecoveryAction =
  | "retry"
  | "free-space-and-retry"
  | "request-persistent-storage"
  | "choose-another-file"
  | "transcode-and-retry"
  | "relink-source"
  | "reload-latest-project"
  | "restore-last-known-good"
  | "update-app"
  | "close-other-tab"
  | "remove-unused-media";

export type MediaErrorCode =
  | "QUOTA_EXCEEDED" | "STORAGE_UNAVAILABLE" | "UNSUPPORTED_SIGNATURE"
  | "UNSUPPORTED_CONTAINER" | "UNSUPPORTED_CODEC" | "CORRUPT_INPUT"
  | "OVER_BUDGET" | "IMPORT_INTERRUPTED" | "MISSING_SOURCE"
  | "DUPLICATE_PROJECT" | "STALE_PROJECT" | "OWNERSHIP_CONFLICT"
  | "MANIFEST_INVALID" | "MANIFEST_NEWER" | "RELINK_MISMATCH"
  | "DATABASE_ERROR" | "ASSET_REFERENCED" | "ASSET_NOT_FOUND";

export class MediaError extends Error {
  readonly diagnosticId: string;
  constructor(
    readonly code: MediaErrorCode,
    message: string,
    readonly recoveryAction: MediaRecoveryAction,
    readonly details: Readonly<Record<string, unknown>> = {},
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "MediaError";
    this.diagnosticId = `${code}:${typeof details.stage === "string" ? details.stage : "root"}`;
  }
}

export function asMediaError(error: unknown, fallback = "Local media operation failed"): MediaError {
  if (error instanceof MediaError) return error;
  if (error instanceof DOMException && error.name === "QuotaExceededError") {
    return new MediaError("QUOTA_EXCEEDED", "Browser storage is full", "free-space-and-retry", {}, error);
  }
  return new MediaError("DATABASE_ERROR", fallback, "retry", {}, error);
}

export type Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: MediaError };
