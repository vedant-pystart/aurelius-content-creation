import { ProjectModelError, type RecoveryAction } from "./errors";
import type { Clip, MediaClip, ProjectDoc, Track, TrackKind } from "./model";
import { frameIndexToTimeUs, timeUs, timeUsToFrameIndex, type TimeUs } from "./time";

export const TIMELINE_LANES = ["primary", "overlay", "text", "caption", "audio"] as const;
export const MIN_ZOOM_PX_PER_SECOND = 24;
export const MAX_ZOOM_PX_PER_SECOND = 480;

export type TimelineLane = (typeof TIMELINE_LANES)[number];
export type SnapKind = "project-zero" | "playhead" | "clip-boundary" | "caption-boundary";
export interface SnapCandidate { readonly timeUs: TimeUs; readonly kind: SnapKind; readonly id?: string }
export interface SnapResult { readonly timeUs: TimeUs; readonly snapped: boolean; readonly candidate?: SnapCandidate }
export type TimelinePlan<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: ProjectModelError };

export interface MovePlan { readonly clipId: string; readonly startUs: TimeUs }
export interface TrimPlan { readonly clipId: string; readonly startUs: TimeUs; readonly durationUs: TimeUs; readonly sourceInUs?: TimeUs; readonly sourceDurationUs?: TimeUs }
export interface SplitPlan { readonly clipId: string; readonly atUs: TimeUs; readonly rightStartUs: TimeUs; readonly leftDurationUs: TimeUs; readonly rightDurationUs: TimeUs; readonly rightSourceInUs?: TimeUs }
export interface DuplicatePlan { readonly clipId: string; readonly startUs: TimeUs }
export interface RipplePlan { readonly clipId: string; readonly removedDurationUs: TimeUs; readonly shiftedClipIds: readonly string[]; readonly shiftedCueIds: readonly string[] }
export interface TransitionPlan { readonly trackId: string; readonly fromClipId: string; readonly toClipId: string; readonly durationUs: TimeUs; readonly maximumDurationUs: TimeUs }

export function clipEndUs(clip: Pick<Clip, "startUs" | "durationUs">): TimeUs { return timeUs(clip.startUs + clip.durationUs); }
export function isLaneCompatible(track: Pick<Track, "kind">, kind: Clip["kind"]): boolean {
  return (track.kind === "primary" || track.kind === "overlay") ? (kind === "video" || kind === "image")
    : track.kind === "text" ? kind === "text" : track.kind === "audio" ? kind === "audio" : false;
}
export function pixelsPerSecond(zoom: number): number { return Math.max(MIN_ZOOM_PX_PER_SECOND, Math.min(MAX_ZOOM_PX_PER_SECOND, Math.round(zoom))); }
export function timeToPixels(value: TimeUs, zoom: number): number { return value / 1_000_000 * pixelsPerSecond(zoom); }
export function pixelsToTime(value: number, zoom: number, doc: ProjectDoc): TimeUs {
  const raw = Math.max(0, Math.round(value / pixelsPerSecond(zoom) * 1_000_000));
  return frameIndexToTimeUs(timeUsToFrameIndex(timeUs(raw), doc.composition.frameRate, "nearest"), doc.composition.frameRate);
}
export function alignToFrame(value: number, doc: ProjectDoc): TimeUs {
  return frameIndexToTimeUs(timeUsToFrameIndex(timeUs(Math.max(0, Math.round(value))), doc.composition.frameRate, "nearest"), doc.composition.frameRate);
}

const SNAP_PRIORITY: Readonly<Record<SnapKind, number>> = { "project-zero": 0, playhead: 1, "clip-boundary": 2, "caption-boundary": 3 };
export function snapCandidates(doc: ProjectDoc, playheadUs: TimeUs, excludeIds: readonly string[] = []): readonly SnapCandidate[] {
  const excluded = new Set(excludeIds); const candidates: SnapCandidate[] = [{ timeUs: timeUs(0), kind: "project-zero" }, { timeUs: playheadUs, kind: "playhead" }];
  for (const clip of Object.values(doc.clips)) if (!excluded.has(clip.id)) candidates.push({ timeUs: clip.startUs, kind: "clip-boundary", id: clip.id }, { timeUs: clipEndUs(clip), kind: "clip-boundary", id: clip.id });
  for (const cue of Object.values(doc.captionCues)) if (!excluded.has(cue.id)) candidates.push({ timeUs: cue.startUs, kind: "caption-boundary", id: cue.id }, { timeUs: cue.endUs, kind: "caption-boundary", id: cue.id });
  return candidates;
}
export function snapTime(doc: ProjectDoc, proposalUs: number, playheadUs: TimeUs, toleranceUs: number, bypass = false, excludeIds: readonly string[] = []): SnapResult {
  const aligned = alignToFrame(proposalUs, doc); if (bypass) return { timeUs: aligned, snapped: false };
  const candidate = snapCandidates(doc, playheadUs, excludeIds).filter((item) => Math.abs(item.timeUs - aligned) <= toleranceUs)
    .sort((a, b) => Math.abs(a.timeUs - aligned) - Math.abs(b.timeUs - aligned) || SNAP_PRIORITY[a.kind] - SNAP_PRIORITY[b.kind] || (a.id ?? "").localeCompare(b.id ?? ""))[0];
  return candidate ? { timeUs: candidate.timeUs, snapped: true, candidate } : { timeUs: aligned, snapped: false };
}

function rejected(message: string, recovery: RecoveryAction = "revise-edit", details: Readonly<Record<string, unknown>> = {}): TimelinePlan<never> {
  return { ok: false, error: new ProjectModelError("COMMAND_REJECTED", message, recovery, details) };
}
function trackFor(doc: ProjectDoc, trackId: string): Track | undefined { return doc.tracks[trackId]; }
function editableTrack(doc: ProjectDoc, trackId: string): TimelinePlan<Track> { const track = trackFor(doc, trackId); return !track ? rejected("Timeline lane does not exist") : track.locked ? rejected("This lane is locked", "revise-edit", { trackId, correction: "unlock-track" }) : { ok: true, value: track }; }
function collision(doc: ProjectDoc, track: Track, startUs: TimeUs, durationUs: TimeUs, except: readonly string[] = []): string | undefined {
  if (track.kind !== "primary") return undefined; const excluded = new Set(except); const end = startUs + durationUs;
  return track.clipOrder.find((id) => { const clip = doc.clips[id]; return !!clip && !excluded.has(id) && startUs < clip.startUs + clip.durationUs && clip.startUs < end; });
}
function sourceLegal(doc: ProjectDoc, clip: Exclude<Clip, { kind: "text" }>, sourceInUs: TimeUs, sourceDurationUs: TimeUs): boolean { const asset = doc.assets[clip.assetId]; return !asset?.durationUs || sourceInUs + sourceDurationUs <= asset.durationUs; }
export function planMove(doc: ProjectDoc, clipId: string, proposedStartUs: number): TimelinePlan<MovePlan> {
  const clip = doc.clips[clipId]; if (!clip) return rejected("Clip no longer exists", "reload-latest-project"); const ready = editableTrack(doc, clip.trackId); if (!ready.ok) return ready;
  const startUs = alignToFrame(proposedStartUs, doc); const conflict = collision(doc, ready.value, startUs, clip.durationUs, [clipId]);
  return conflict ? rejected("Primary clips cannot overlap", "revise-edit", { conflict, correction: "move-to-open-space" }) : { ok: true, value: { clipId, startUs } };
}
export function planTrim(doc: ProjectDoc, clipId: string, proposedStartUs: number, proposedDurationUs: number, proposedSourceInUs?: number): TimelinePlan<TrimPlan> {
  const clip = doc.clips[clipId]; if (!clip) return rejected("Clip no longer exists", "reload-latest-project"); const ready = editableTrack(doc, clip.trackId); if (!ready.ok) return ready;
  const startUs = alignToFrame(proposedStartUs, doc); const durationUs = alignToFrame(proposedDurationUs, doc); if (durationUs <= 0) return rejected("A clip must be at least one frame long", "revise-edit", { correction: "lengthen-clip" });
  const conflict = collision(doc, ready.value, startUs, durationUs, [clipId]); if (conflict) return rejected("Primary clips cannot overlap", "revise-edit", { conflict, correction: "move-to-open-space" });
  if (clip.kind === "text") return { ok: true, value: { clipId, startUs, durationUs } };
  const sourceInUs = alignToFrame(proposedSourceInUs ?? clip.sourceInUs, doc); const sourceDurationUs = durationUs;
  if (!sourceLegal(doc, clip, sourceInUs, sourceDurationUs)) return rejected("This trim exceeds the available source media", "revise-edit", { clipId, correction: "trim-within-source" });
  return { ok: true, value: { clipId, startUs, durationUs, sourceInUs, sourceDurationUs } };
}
export function planSplit(doc: ProjectDoc, clipId: string, atUs: number): TimelinePlan<SplitPlan> {
  const clip = doc.clips[clipId]; if (!clip) return rejected("Clip no longer exists", "reload-latest-project"); const ready = editableTrack(doc, clip.trackId); if (!ready.ok) return ready;
  const split = alignToFrame(atUs, doc); if (split <= clip.startUs || split >= clipEndUs(clip)) return rejected("Split must be inside the clip", "revise-edit", { correction: "choose-a-point-inside-clip" });
  const leftDurationUs = timeUs(split - clip.startUs); const rightDurationUs = timeUs(clip.durationUs - leftDurationUs);
  return { ok: true, value: { clipId, atUs: split, rightStartUs: split, leftDurationUs, rightDurationUs, ...(clip.kind === "text" ? {} : { rightSourceInUs: timeUs(clip.sourceInUs + leftDurationUs) }) } };
}
export function planDuplicate(doc: ProjectDoc, clipId: string, proposedStartUs: number): TimelinePlan<DuplicatePlan> {
  const clip = doc.clips[clipId]; if (!clip) return rejected("Clip no longer exists", "reload-latest-project"); const ready = editableTrack(doc, clip.trackId); if (!ready.ok) return ready;
  const startUs = alignToFrame(proposedStartUs, doc); const conflict = collision(doc, ready.value, startUs, clip.durationUs, [clipId]); return conflict ? rejected("Primary clips cannot overlap", "revise-edit", { conflict, correction: "move-to-open-space" }) : { ok: true, value: { clipId, startUs } };
}
export function planRippleDelete(doc: ProjectDoc, clipId: string): TimelinePlan<RipplePlan> {
  const clip = doc.clips[clipId]; if (!clip) return rejected("Clip no longer exists", "reload-latest-project"); const ready = editableTrack(doc, clip.trackId); if (!ready.ok) return ready;
  const end = clipEndUs(clip); const shiftedClipIds = Object.values(doc.clips).filter((other) => other.id !== clipId && other.startUs >= end).map((other) => other.id);
  const shiftedCueIds = Object.values(doc.captionCues).filter((cue) => cue.startUs >= end).map((cue) => cue.id);
  return { ok: true, value: { clipId, removedDurationUs: clip.durationUs, shiftedClipIds, shiftedCueIds } };
}
export function planTransition(doc: ProjectDoc, fromClipId: string, toClipId: string, durationUs: number): TimelinePlan<TransitionPlan> {
  const from = doc.clips[fromClipId]; const to = doc.clips[toClipId]; if (!from || !to) return rejected("Both clips must exist", "revise-edit", { correction: "choose-another-boundary" });
  if (from.kind === "text" || to.kind === "text" || !["video", "image"].includes(from.kind) || !["video", "image"].includes(to.kind)) return rejected("Transitions are only available between visual clips", "revise-edit", { correction: "choose-visual-clips" });
  if (from.trackId !== to.trackId) return rejected("Transitions need clips on the same lane", "revise-edit", { correction: "choose-another-boundary" }); const track = editableTrack(doc, from.trackId); if (!track.ok) return track;
  if (track.value.kind !== "primary" && track.value.kind !== "overlay") return rejected("Transitions are only available on visual lanes", "revise-edit", { correction: "choose-visual-clips" });
  const index = track.value.clipOrder.indexOf(from.id); if (index < 0 || track.value.clipOrder[index + 1] !== to.id || clipEndUs(from) !== to.startUs) return rejected("Transition clips must touch at one boundary", "revise-edit", { correction: "close-the-gap-or-choose-another-boundary" });
  const fromAsset = doc.assets[from.assetId]; const toAsset = doc.assets[to.assetId]; const tail = fromAsset?.durationUs === undefined ? Number.MAX_SAFE_INTEGER : fromAsset.durationUs - from.sourceInUs - from.sourceDurationUs; const head = to.sourceInUs;
  const maximumDurationUs = timeUs(Math.max(0, Math.min(from.durationUs, to.durationUs, tail, head))); const requested = alignToFrame(durationUs, doc);
  if (requested <= 0 || requested > maximumDurationUs) return rejected(`Transition needs more source handles (maximum ${maximumDurationUs}μs)`, "revise-edit", { maximumDurationUs, correction: "shorten-transition-or-trim-clips" });
  return { ok: true, value: { trackId: track.value.id, fromClipId, toClipId, durationUs: requested, maximumDurationUs } };
}
