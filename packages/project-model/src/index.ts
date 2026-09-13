export {
  timeUs, frameIndex, frameRate, timeRange, rangeContains, rangesOverlap,
  intersectRanges, clampTime, frameIndexToTimeUs, timeUsToFrameIndex,
} from "./time";
export type { TimeUs, FrameIndex, FrameRate, TimeRange, RoundingMode } from "./time";
export type {
  ProjectDoc, Composition, BrandTokens, AssetRef, Track, TrackKind, Clip, ClipKind,
  MediaClip, AudioClip, AudioRole, TextClip, Transition, CaptionCue, CaptionTrackSettings, TextStyle, Marker, Transform, Crop, Motion, AureliusStyleBinding, AspectHeight,
} from "./model";
export { CURRENT_SCHEMA_VERSION, FrameRateSchema, ClipSchema, ProjectDocSchema } from "./schema";
export { createProjectDoc } from "./factory";
export type { CreateProjectOptions } from "./factory";
export { validateCurrentProjectDoc, assertValidProjectDoc, deriveProjectDurationUs } from "./validation";
export type { ValidationResult } from "./validation";
export { ProjectModelError, asProjectModelError } from "./errors";
export type { ProjectErrorCode, ProjectIssue, RecoveryAction } from "./errors";
export { loadProjectDoc, migrateProjectDoc } from "./migrations/migrate";
export type { MigrationReport, MigrationStep, LoadProjectResult } from "./migrations/types";
export { executeCommand, applyTransactionForward, applyTransactionInverse } from "./commands/execute";
export type { EditorCommand, TemplateFragment, CommandExecutionContext, CommandResult, CommandTransaction, CommandHandler, CommandHandlerRegistry } from "./commands/contracts";
export { EditorHistory } from "./commands/history";
export { TIMELINE_LANES, MIN_ZOOM_PX_PER_SECOND, MAX_ZOOM_PX_PER_SECOND, clipEndUs, isLaneCompatible, pixelsPerSecond, timeToPixels, pixelsToTime, alignToFrame, snapCandidates, snapTime, planMove, planTrim, planSplit, planDuplicate, planRippleDelete, planTransition } from "./timeline";
export type { TimelineLane, SnapKind, SnapCandidate, SnapResult, TimelinePlan, MovePlan, TrimPlan, SplitPlan, DuplicatePlan, RipplePlan, TransitionPlan } from "./timeline";
export { InMemoryProjectRepository } from "./repository";
export type { ProjectRepository, ProjectSummary } from "./repository";
