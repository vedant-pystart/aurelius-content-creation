import type { CaptionCue, Clip, ProjectDoc, TrackKind } from "./model";
import { ProjectModelError, type ProjectIssue } from "./errors";
import { ProjectDocSchema } from "./schema";
import { timeUs, type TimeUs } from "./time";

export type ValidationResult =
  | { readonly ok: true; readonly value: ProjectDoc }
  | { readonly ok: false; readonly error: ProjectModelError };

const MAX_ISSUES = 100;
const compatibleKinds: Readonly<Record<TrackKind, readonly Clip["kind"][]>> = {
  primary: ["video", "image"], overlay: ["video", "image"], text: ["text"], caption: [], audio: ["audio"],
};

function issue(list: ProjectIssue[], code: string, message: string, path: string, entityId?: string): void {
  if (list.length >= MAX_ISSUES) return;
  list.push(entityId === undefined ? { code, message, path } : { code, message, path, entityId });
}

function validateOrder(
  list: ProjectIssue[], order: readonly string[], records: Readonly<Record<string, { readonly id: string }>>, path: string,
): void {
  const seen = new Set<string>();
  for (const [index, id] of order.entries()) {
    if (seen.has(id)) issue(list, "DUPLICATE_ORDER_ID", `Duplicate ${id} in ordering`, `${path}.${index}`, id);
    seen.add(id);
    if (!records[id]) issue(list, "MISSING_ORDER_REFERENCE", `Ordering references missing ${id}`, `${path}.${index}`, id);
  }
  for (const id of Object.keys(records).sort()) {
    if (!seen.has(id)) issue(list, "UNLISTED_ENTITY", `${id} is not present in ${path}`, path, id);
  }
}

function validateRecordIds(list: ProjectIssue[], maps: readonly [string, Readonly<Record<string, { readonly id: string }>>][]): void {
  const global = new Map<string, string>();
  for (const [mapName, records] of maps) {
    for (const [key, entity] of Object.entries(records).sort(([a], [b]) => a.localeCompare(b))) {
      if (key !== entity.id) issue(list, "RECORD_ID_MISMATCH", `Record key ${key} does not match entity id ${entity.id}`, `${mapName}.${key}.id`, entity.id);
      const prior = global.get(entity.id);
      if (prior) issue(list, "DUPLICATE_ENTITY_ID", `Entity id ${entity.id} is also used in ${prior}`, `${mapName}.${key}.id`, entity.id);
      else global.set(entity.id, mapName);
    }
  }
}

function endOf(clip: Clip): number { return clip.startUs + clip.durationUs; }

function validateCaptions(doc: ProjectDoc, issues: ProjectIssue[]): void {
  const expectedOrder = Object.values(doc.captionCues)
    .sort((left, right) => left.startUs - right.startUs || left.endUs - right.endUs || left.id.localeCompare(right.id))
    .map((cue) => cue.id);
  if (expectedOrder.some((id, index) => doc.captionCueOrder[index] !== id)) {
    issue(issues, "UNSORTED_CAPTION_ORDER", "Caption cue order is not chronological", "captionCueOrder");
  }
  const byTrack = new Map<string, CaptionCue[]>();
  for (const cue of Object.values(doc.captionCues)) {
    const track = doc.tracks[cue.trackId];
    if (!track) issue(issues, "MISSING_TRACK_REFERENCE", `Caption ${cue.id} references a missing track`, `captionCues.${cue.id}.trackId`, cue.id);
    else if (track.kind !== "caption") issue(issues, "INCOMPATIBLE_TRACK_KIND", `Caption ${cue.id} must belong to a caption track`, `captionCues.${cue.id}.trackId`, cue.id);
    if (!doc.textStyles[cue.textStyleId]) issue(issues, "MISSING_STYLE_REFERENCE", `Caption ${cue.id} references a missing style`, `captionCues.${cue.id}.textStyleId`, cue.id);
    if (cue.endUs <= cue.startUs) issue(issues, "INVALID_TIME_RANGE", `Caption ${cue.id} must have positive duration`, `captionCues.${cue.id}.endUs`, cue.id);
    const wordCount = cue.text.trim().split(/\s+/u).filter(Boolean).length;
    const seen = new Set<number>();
    for (const index of cue.emphasisWordIndexes) {
      if (index >= wordCount || seen.has(index)) issue(issues, "INVALID_WORD_INDEX", `Caption ${cue.id} has an invalid emphasis word index`, `captionCues.${cue.id}.emphasisWordIndexes`, cue.id);
      seen.add(index);
    }
    const group = byTrack.get(cue.trackId) ?? [];
    group.push(cue);
    byTrack.set(cue.trackId, group);
  }
  for (const track of Object.values(doc.tracks)) {
    if (track.kind !== "caption") continue;
    const settings = doc.captionSettings[track.id];
    if (!settings) issue(issues, "MISSING_CAPTION_SETTINGS", `Caption track ${track.id} is missing settings`, `captionSettings.${track.id}`, track.id);
    else if (!doc.textStyles[settings.defaultTextStyleId]) issue(issues, "MISSING_STYLE_REFERENCE", `Caption track ${track.id} has an invalid default style`, `captionSettings.${track.id}.defaultTextStyleId`, track.id);
  }
  for (const cues of byTrack.values()) {
    cues.sort((a, b) => a.startUs - b.startUs || a.id.localeCompare(b.id));
    for (let index = 1; index < cues.length; index += 1) {
      const previous = cues[index - 1]; const current = cues[index];
      if (previous && current && previous.endUs > current.startUs) {
        issue(issues, "CAPTION_OVERLAP", `Caption ${current.id} overlaps ${previous.id}`, `captionCues.${current.id}.startUs`, current.id);
      }
    }
  }
}

function validateClips(doc: ProjectDoc, issues: ProjectIssue[]): void {
  const membership = new Map<string, string>();
  for (const trackId of doc.trackOrder) {
    const track = doc.tracks[trackId];
    if (!track) continue;
    let prior: Clip | undefined;
    for (const [orderIndex, clipId] of track.clipOrder.entries()) {
      const clip = doc.clips[clipId];
      if (!clip) { issue(issues, "MISSING_CLIP_REFERENCE", `Track ${track.id} references missing clip ${clipId}`, `tracks.${track.id}.clipOrder.${orderIndex}`, clipId); continue; }
      const existing = membership.get(clipId);
      if (existing) issue(issues, "DUPLICATE_CLIP_MEMBERSHIP", `Clip ${clipId} appears in tracks ${existing} and ${track.id}`, `tracks.${track.id}.clipOrder.${orderIndex}`, clipId);
      membership.set(clipId, track.id);
      if (clip.trackId !== track.id) issue(issues, "CLIP_TRACK_MISMATCH", `Clip ${clipId} points to ${clip.trackId}, not ${track.id}`, `clips.${clipId}.trackId`, clipId);
      if (!compatibleKinds[track.kind].includes(clip.kind)) issue(issues, "INCOMPATIBLE_TRACK_KIND", `${clip.kind} clip ${clipId} cannot be placed on ${track.kind}`, `clips.${clipId}.kind`, clipId);
      if (prior && (clip.startUs < prior.startUs || (clip.startUs === prior.startUs && clip.id.localeCompare(prior.id) < 0))) {
        issue(issues, "UNSORTED_CLIP_ORDER", `Track ${track.id} clip order is not chronological`, `tracks.${track.id}.clipOrder.${orderIndex}`, clipId);
      }
      if (prior && track.kind === "primary" && endOf(prior) > clip.startUs) {
        issue(issues, "PRIMARY_OVERLAP", `Primary clips ${prior.id} and ${clip.id} overlap`, `clips.${clip.id}.startUs`, clip.id);
      }
      prior = clip;
    }
  }
  for (const clip of Object.values(doc.clips)) {
    if (!membership.has(clip.id)) issue(issues, "UNLISTED_CLIP", `Clip ${clip.id} is not listed by a track`, `clips.${clip.id}`, clip.id);
    const track = doc.tracks[clip.trackId];
    if (!track) issue(issues, "MISSING_TRACK_REFERENCE", `Clip ${clip.id} references missing track ${clip.trackId}`, `clips.${clip.id}.trackId`, clip.id);
    if (clip.kind === "text") {
      if (!doc.textStyles[clip.textStyleId]) issue(issues, "MISSING_STYLE_REFERENCE", `Text clip ${clip.id} references missing style`, `clips.${clip.id}.textStyleId`, clip.id);
      if (clip.motion.entranceUs + clip.motion.holdUs + clip.motion.exitUs > clip.durationUs) issue(issues, "MOTION_EXCEEDS_CLIP", `Text motion exceeds clip ${clip.id} duration`, `clips.${clip.id}.motion`, clip.id);
    } else {
      const asset = doc.assets[clip.assetId];
      if (!asset) issue(issues, "MISSING_ASSET_REFERENCE", `Clip ${clip.id} references missing asset ${clip.assetId}`, `clips.${clip.id}.assetId`, clip.id);
      else {
        const compatibleAsset = clip.kind === "audio" ? (clip.role === "source" ? asset.kind === "video" : asset.kind === "audio") : asset.kind === clip.kind;
        if (!compatibleAsset) issue(issues, "ASSET_KIND_MISMATCH", `Clip ${clip.id} has an incompatible ${clip.kind === "audio" ? clip.role : clip.kind} asset`, `clips.${clip.id}.assetId`, clip.id);
        if (asset.durationUs !== undefined && clip.sourceInUs + clip.sourceDurationUs > asset.durationUs) issue(issues, "SOURCE_OUT_OF_BOUNDS", `Clip ${clip.id} exceeds source duration`, `clips.${clip.id}.sourceDurationUs`, clip.id);
      }
      if (clip.fadeInUs + clip.fadeOutUs > clip.durationUs) issue(issues, "FADES_EXCEED_CLIP", `Clip ${clip.id} fades exceed its duration`, `clips.${clip.id}.fadeOutUs`, clip.id);
    }
  }
}

function validateTransitions(doc: ProjectDoc, issues: ProjectIssue[]): void {
  for (const transition of Object.values(doc.transitions)) {
    const track = doc.tracks[transition.trackId];
    const from = doc.clips[transition.fromClipId];
    const to = doc.clips[transition.toClipId];
    if (!track || !from || !to) { issue(issues, "MISSING_TRANSITION_REFERENCE", `Transition ${transition.id} has a missing reference`, `transitions.${transition.id}`, transition.id); continue; }
    const fromIndex = track.clipOrder.indexOf(from.id);
    if (from.trackId !== track.id || to.trackId !== track.id || fromIndex < 0 || track.clipOrder[fromIndex + 1] !== to.id) {
      issue(issues, "NON_ADJACENT_TRANSITION", `Transition ${transition.id} must connect adjacent same-track clips`, `transitions.${transition.id}`, transition.id);
    }
    if ((track.kind !== "primary" && track.kind !== "overlay") || (from.kind !== "video" && from.kind !== "image") || (to.kind !== "video" && to.kind !== "image")) {
      issue(issues, "INCOMPATIBLE_TRANSITION", `Transition ${transition.id} must join visual clips on a visual lane`, `transitions.${transition.id}`, transition.id);
    }
    if (from.startUs + from.durationUs !== to.startUs) issue(issues, "TRANSITION_GAP", `Transition ${transition.id} requires clips that meet at one boundary`, `transitions.${transition.id}`, transition.id);
    if (transition.durationUs > from.durationUs || transition.durationUs > to.durationUs) issue(issues, "TRANSITION_TOO_LONG", `Transition ${transition.id} exceeds clip duration`, `transitions.${transition.id}.durationUs`, transition.id);
    if (from.kind !== "text" && to.kind !== "text") {
      const fromAsset = doc.assets[from.assetId]; const toAsset = doc.assets[to.assetId];
      const tail = fromAsset?.durationUs === undefined ? Number.MAX_SAFE_INTEGER : fromAsset.durationUs - from.sourceInUs - from.sourceDurationUs;
      const head = to.sourceInUs;
      if (transition.durationUs > tail || transition.durationUs > head) issue(issues, "TRANSITION_HANDLE_SHORT", `Transition ${transition.id} exceeds available source handles`, `transitions.${transition.id}.durationUs`, transition.id);
    }
  }
}

export function validateCurrentProjectDoc(input: unknown): ValidationResult {
  const parsed = ProjectDocSchema.safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, MAX_ISSUES).map((item) => ({
      code: "SCHEMA_INVALID", message: item.message, path: item.path.join("."),
    }));
    return { ok: false, error: new ProjectModelError("MALFORMED_PROJECT", "Project shape is invalid", "fix-or-relink-project-data", {}, issues) };
  }
  const doc = parsed.data as unknown as ProjectDoc;
  const issues: ProjectIssue[] = [];
  validateRecordIds(issues, [
    ["assets", doc.assets], ["tracks", doc.tracks], ["clips", doc.clips], ["transitions", doc.transitions],
    ["captionCues", doc.captionCues], ["textStyles", doc.textStyles], ["markers", doc.markers],
  ]);
  validateOrder(issues, doc.assetOrder, doc.assets, "assetOrder");
  validateOrder(issues, doc.trackOrder, doc.tracks, "trackOrder");
  for (const id of Object.keys(doc.captionSettings)) if (!doc.tracks[id] || doc.tracks[id]?.kind !== "caption") issue(issues, "INVALID_CAPTION_SETTINGS_TRACK", `Caption settings ${id} must reference a caption track`, `captionSettings.${id}`, id);
  validateOrder(issues, doc.transitionOrder, doc.transitions, "transitionOrder");
  validateOrder(issues, doc.captionCueOrder, doc.captionCues, "captionCueOrder");
  validateOrder(issues, doc.textStyleOrder, doc.textStyles, "textStyleOrder");
  validateOrder(issues, doc.markerOrder, doc.markers, "markerOrder");
  validateClips(doc, issues);
  validateCaptions(doc, issues);
  validateTransitions(doc, issues);
  if (issues.length > 0) return { ok: false, error: new ProjectModelError("PROJECT_INVARIANT_VIOLATION", "Project relationships or timing are invalid", "fix-or-relink-project-data", {}, issues) };
  return { ok: true, value: doc };
}

export function assertValidProjectDoc(input: unknown): ProjectDoc {
  const result = validateCurrentProjectDoc(input);
  if (!result.ok) throw result.error;
  return result.value;
}

export function deriveProjectDurationUs(doc: ProjectDoc): TimeUs {
  let maximum = 0;
  for (const clip of Object.values(doc.clips)) maximum = Math.max(maximum, clip.startUs + clip.durationUs);
  for (const cue of Object.values(doc.captionCues)) maximum = Math.max(maximum, cue.endUs);
  return timeUs(maximum);
}
