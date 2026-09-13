import type { Draft } from "immer";
import { ProjectModelError } from "../errors";
import { timeUs } from "../time";
import type { Clip, ProjectDoc } from "../model";
import type { CommandHandler, CommandHandlerRegistry, EditorCommand } from "./contracts";
import { planDuplicate, planMove, planRippleDelete, planSplit, planTransition, planTrim } from "../timeline";

function reject(message: string, details: Readonly<Record<string, unknown>> = {}): never {
  throw new ProjectModelError("COMMAND_REJECTED", message, "revise-edit", details);
}

function getTrack(draft: Draft<ProjectDoc>, trackId: string) {
  const track = draft.tracks[trackId];
  if (!track) reject(`Track ${trackId} does not exist`, { trackId });
  return track;
}

function getClip(draft: Draft<ProjectDoc>, clipId: string) {
  const clip = draft.clips[clipId];
  if (!clip) reject(`Clip ${clipId} does not exist`, { clipId });
  return clip;
}

function sortTrack(draft: Draft<ProjectDoc>, trackId: string): void {
  const track = getTrack(draft, trackId);
  track.clipOrder.sort((leftId, rightId) => { const left = draft.clips[leftId]; const right = draft.clips[rightId]; return !left || !right ? leftId.localeCompare(rightId) : left.startUs - right.startUs || left.layer - right.layer || left.id.localeCompare(right.id); });
}
function removeRelatedTransitions(draft: Draft<ProjectDoc>, clipId: string): void { for (const id of [...draft.transitionOrder]) { const transition = draft.transitions[id]; if (transition && (transition.fromClipId === clipId || transition.toClipId === clipId)) { delete draft.transitions[id]; draft.transitionOrder.splice(draft.transitionOrder.indexOf(id), 1); } } }
function current(draft: Draft<ProjectDoc>): ProjectDoc { return draft as unknown as ProjectDoc; }

function assertTransform(transform: { x: number; y: number; scaleX: number; scaleY: number; rotationDeg: number; opacity: number }): void {
  if (![transform.x, transform.y, transform.scaleX, transform.scaleY, transform.rotationDeg, transform.opacity].every(Number.isFinite)) reject("Transform values must be finite");
  if (transform.x < -2 || transform.x > 3 || transform.y < -2 || transform.y > 3) reject("Transform position is out of bounds");
  if (transform.scaleX < 0.05 || transform.scaleX > 8 || transform.scaleY < 0.05 || transform.scaleY > 8) reject("Transform scale must be between 0.05 and 8");
  if (Math.abs(transform.rotationDeg) > 3600) reject("Transform rotation is out of bounds");
  if (transform.opacity < 0 || transform.opacity > 1) reject("Transform opacity must be between 0 and 1");
}

function assertCrop(crop: { mode: string; x: number; y: number; zoom: number }): void {
  if (!(["fit", "fill", "blur"] as const).includes(crop.mode as "fit" | "fill" | "blur")) reject("Crop mode is unsupported");
  if (![crop.x, crop.y, crop.zoom].every(Number.isFinite) || crop.x < -1 || crop.x > 1 || crop.y < -1 || crop.y > 1 || crop.zoom < 0.1 || crop.zoom > 10) reject("Crop values are out of bounds");
}

function assertAudioClip(draft: Draft<ProjectDoc>, clip: Extract<Clip, { kind: "audio" }>): void {
  const track = getTrack(draft, clip.trackId);
  if (track.kind !== "audio") reject("Audio must be placed on the Audio lane", { trackId: track.id });
  const asset = draft.assets[clip.assetId];
  if (!asset) reject("Audio source asset does not exist", { assetId: clip.assetId });
  if ((clip.role === "source" && asset.kind !== "video") || (clip.role !== "source" && asset.kind !== "audio")) reject("Audio role is incompatible with selected media", { role: clip.role, assetId: clip.assetId });
  if (!Number.isFinite(clip.volume) || clip.volume < 0 || clip.volume > 2) reject("Volume must be between 0 and 2");
  if (clip.fadeInUs + clip.fadeOutUs > clip.durationUs) reject("Audio fades cannot exceed the clip duration");
  if (asset.durationUs !== undefined && clip.sourceInUs + clip.sourceDurationUs > asset.durationUs) reject("Audio source range exceeds the selected media");
}

export function applyFoundationalCommand(draft: Draft<ProjectDoc>, command: EditorCommand): void {
  switch (command.type) {
    case "project/rename": {
      const title = command.title.trim();
      if (!title) reject("Project title cannot be empty");
      draft.title = title;
      return;
    }
    case "composition/setBackground":
      if (!/^#[0-9a-fA-F]{6}$/.test(command.color)) reject("Background must be a six-digit hex color");
      draft.composition.background = command.color.toUpperCase();
      return;
    case "composition/setFormat":
      if (![1920, 1350, 1080].includes(command.height)) reject("Format must be 9:16, 4:5, or 1:1");
      draft.composition.height = command.height;
      return;
    case "asset/register": {
      if (draft.assets[command.asset.id]) reject(`Asset ${command.asset.id} already exists`, { assetId: command.asset.id });
      if (Object.values(draft.assets).some((asset) => asset?.fingerprint === command.asset.fingerprint)) reject("This media is already registered", { fingerprint: command.asset.fingerprint });
      const index = command.orderIndex ?? draft.assetOrder.length;
      if (!Number.isSafeInteger(index) || index < 0 || index > draft.assetOrder.length) reject("Asset order index is invalid", { index });
      draft.assets[command.asset.id] = command.asset;
      draft.assetOrder.splice(index, 0, command.asset.id);
      return;
    }
    case "asset/rename": {
      const asset = draft.assets[command.assetId];
      if (!asset) reject(`Asset ${command.assetId} does not exist`, { assetId: command.assetId });
      const name = command.name.trim();
      if (!name) reject("Asset name cannot be empty", { assetId: command.assetId });
      asset.name = name;
      return;
    }
    case "asset/replaceMetadata": {
      const current = draft.assets[command.assetId];
      if (!current) reject(`Asset ${command.assetId} does not exist`, { assetId: command.assetId });
      if (current.kind !== command.metadata.kind) reject("Replacement media must have the same kind", { assetId: command.assetId });
      if (Object.values(draft.assets).some((asset) => asset && asset.id !== command.assetId && asset.fingerprint === command.metadata.fingerprint)) reject("Replacement duplicates another registered asset", { fingerprint: command.metadata.fingerprint });
      for (const clip of Object.values(draft.clips)) {
        if (clip?.kind !== "text" && clip.assetId === command.assetId && command.metadata.durationUs !== undefined && clip.sourceInUs + clip.sourceDurationUs > command.metadata.durationUs) {
          reject("Replacement is shorter than an existing clip edit", { assetId: command.assetId, clipId: clip.id });
        }
      }
      draft.assets[command.assetId] = { ...command.metadata, id: command.assetId };
      return;
    }
    case "asset/remove": {
      const current = draft.assets[command.assetId];
      if (!current) reject(`Asset ${command.assetId} does not exist`, { assetId: command.assetId });
      const referenced = Object.values(draft.clips).find((clip) => clip?.kind !== "text" && clip.assetId === command.assetId);
      if (referenced) reject("Asset is still used by a clip", { assetId: command.assetId, clipId: referenced.id });
      const index = draft.assetOrder.indexOf(command.assetId);
      if (index < 0) reject(`Asset ${command.assetId} is not listed`, { assetId: command.assetId });
      draft.assetOrder.splice(index, 1);
      delete draft.assets[command.assetId];
      return;
    }
    case "clip/add": {
      if (draft.clips[command.clip.id]) reject(`Clip ${command.clip.id} already exists`, { clipId: command.clip.id });
      const track = getTrack(draft, command.clip.trackId);
      const index = command.orderIndex ?? track.clipOrder.length;
      if (!Number.isSafeInteger(index) || index < 0 || index > track.clipOrder.length) reject("Clip order index is invalid", { index });
      draft.clips[command.clip.id] = command.clip as Draft<Clip>;
      track.clipOrder.splice(index, 0, command.clip.id);
      if (command.orderIndex === undefined) {
        track.clipOrder.sort((leftId, rightId) => {
          const left = draft.clips[leftId]; const right = draft.clips[rightId];
          if (!left || !right) return leftId.localeCompare(rightId);
          return left.startUs - right.startUs || left.id.localeCompare(right.id);
        });
      }
      return;
    }
    case "clip/remove": {
      const clip = getClip(draft, command.clipId);
      const track = getTrack(draft, clip.trackId);
      const index = track.clipOrder.indexOf(command.clipId);
      if (index < 0) reject(`Clip ${command.clipId} is not listed in its track`, { clipId: command.clipId });
      track.clipOrder.splice(index, 1);
      delete draft.clips[command.clipId];
      for (const transitionId of [...draft.transitionOrder]) {
        const transition = draft.transitions[transitionId];
        if (transition && (transition.fromClipId === command.clipId || transition.toClipId === command.clipId)) {
          delete draft.transitions[transitionId];
          const transitionIndex = draft.transitionOrder.indexOf(transitionId);
          if (transitionIndex >= 0) draft.transitionOrder.splice(transitionIndex, 1);
        }
      }
      return;
    }
    case "clip/setTiming": {
      const clip = getClip(draft, command.clipId);
      clip.startUs = command.startUs;
      clip.durationUs = command.durationUs;
      if (clip.kind !== "text") {
        if (command.sourceInUs !== undefined) clip.sourceInUs = command.sourceInUs;
        if (command.sourceDurationUs !== undefined) clip.sourceDurationUs = command.sourceDurationUs;
      } else if (command.sourceInUs !== undefined || command.sourceDurationUs !== undefined) {
        reject("Text clips do not have source timing", { clipId: command.clipId });
      }
      const track = getTrack(draft, clip.trackId);
      track.clipOrder.sort((leftId, rightId) => {
        const left = draft.clips[leftId]; const right = draft.clips[rightId];
        if (!left || !right) return leftId.localeCompare(rightId);
        return left.startUs - right.startUs || left.id.localeCompare(right.id);
      });
      return;
    }
    case "clip/setTransform": {
      const clip = getClip(draft, command.clipId);
      if (clip.kind === "audio") reject("Audio clips cannot be transformed", { clipId: clip.id });
      assertTransform(command.transform);
      clip.transform = { ...command.transform } as never;
      return;
    }
    case "clip/setCrop": {
      const clip = getClip(draft, command.clipId);
      if (clip.kind !== "image" && clip.kind !== "video") reject("Only visual media supports crop", { clipId: clip.id });
      assertCrop(command.crop);
      clip.crop = { ...command.crop } as never;
      return;
    }
    case "clip/setLayer": {
      const clip = getClip(draft, command.clipId); const track = getTrack(draft, clip.trackId);
      if (track.locked) reject("This lane is locked", { trackId: track.id });
      if (!Number.isSafeInteger(command.layer) || command.layer < 0 || command.layer > 99) reject("Layer must be between 0 and 99");
      clip.layer = command.layer; sortTrack(draft, track.id); return;
    }
    case "text/setContent": {
      const clip = getClip(draft, command.clipId);
      if (clip.kind !== "text") reject("Only text clips have editable content", { clipId: clip.id });
      if (command.content.length > 20_000 || !command.content.trim()) reject("Text content must contain text and stay below 20,000 characters");
      clip.content = command.content.replace(/\r\n?/gu, "\n");
      return;
    }
    case "text/add": {
      const clip = command.clip;
      if (draft.clips[clip.id]) reject(`Clip ${clip.id} already exists`, { clipId: clip.id });
      const track = getTrack(draft, clip.trackId);
      if (track.kind !== "text") reject("Text must be placed on the Text lane", { trackId: track.id });
      if (!draft.textStyles[clip.textStyleId]) reject("Text style does not exist", { styleId: clip.textStyleId });
      if (!clip.content.trim()) reject("Text content cannot be empty"); assertTransform(clip.transform);
      const index = command.orderIndex ?? track.clipOrder.length;
      if (!Number.isSafeInteger(index) || index < 0 || index > track.clipOrder.length) reject("Clip order index is invalid", { index });
      draft.clips[clip.id] = clip as Draft<Clip>; track.clipOrder.splice(index, 0, clip.id); sortTrack(draft, track.id); return;
    }
    case "text/setMotion": {
      const clip = getClip(draft, command.clipId); if (clip.kind !== "text") reject("Only text clips have motion", { clipId: clip.id });
      if (command.motion.entranceUs + command.motion.holdUs + command.motion.exitUs > clip.durationUs) reject("Motion exceeds text clip duration");
      clip.motion = command.motion as never; return;
    }
    case "timeline/move": { const plan = planMove(current(draft), command.clipId, command.startUs); if (!plan.ok) throw plan.error; getClip(draft, command.clipId).startUs = plan.value.startUs; sortTrack(draft, getClip(draft, command.clipId).trackId); return; }
    case "timeline/trim": {
      const plan = planTrim(current(draft), command.clipId, command.startUs, command.durationUs, command.sourceInUs); if (!plan.ok) throw plan.error;
      const clip = getClip(draft, command.clipId); clip.startUs = plan.value.startUs; clip.durationUs = plan.value.durationUs;
      if (clip.kind !== "text") { if (plan.value.sourceInUs !== undefined) clip.sourceInUs = plan.value.sourceInUs; if (plan.value.sourceDurationUs !== undefined) clip.sourceDurationUs = plan.value.sourceDurationUs; }
      sortTrack(draft, clip.trackId); removeRelatedTransitions(draft, clip.id); return;
    }
    case "timeline/split": {
      if (draft.clips[command.newClipId]) reject("New split clip ID already exists", { clipId: command.newClipId }); const plan = planSplit(current(draft), command.clipId, command.atUs); if (!plan.ok) throw plan.error;
      const clip = getClip(draft, command.clipId); const copy = JSON.parse(JSON.stringify(clip)) as Draft<Clip>; copy.id = command.newClipId; copy.startUs = plan.value.rightStartUs; copy.durationUs = plan.value.rightDurationUs;
      clip.durationUs = plan.value.leftDurationUs; if (clip.kind !== "text" && copy.kind !== "text") { clip.sourceDurationUs = plan.value.leftDurationUs; copy.sourceInUs = plan.value.rightSourceInUs!; copy.sourceDurationUs = plan.value.rightDurationUs; }
      draft.clips[copy.id] = copy; getTrack(draft, clip.trackId).clipOrder.push(copy.id); sortTrack(draft, clip.trackId); removeRelatedTransitions(draft, clip.id); return;
    }
    case "timeline/duplicate": {
      if (draft.clips[command.newClipId]) reject("New duplicate clip ID already exists", { clipId: command.newClipId }); const plan = planDuplicate(current(draft), command.clipId, command.startUs); if (!plan.ok) throw plan.error;
      const clip = getClip(draft, command.clipId); const copy = JSON.parse(JSON.stringify(clip)) as Draft<Clip>; copy.id = command.newClipId; copy.startUs = plan.value.startUs; draft.clips[copy.id] = copy; getTrack(draft, clip.trackId).clipOrder.push(copy.id); sortTrack(draft, clip.trackId); return;
    }
    case "timeline/reorderLayer": { const clip = getClip(draft, command.clipId); const track = getTrack(draft, clip.trackId); if (track.locked) reject("This lane is locked", { trackId: track.id }); if (!Number.isSafeInteger(command.layer) || command.layer < 0 || command.layer > 99) reject("Layer must be between 0 and 99"); clip.layer = command.layer; sortTrack(draft, track.id); return; }
    case "timeline/delete": { const clip = getClip(draft, command.clipId); const track = getTrack(draft, clip.trackId); if (track.locked) reject("This lane is locked", { trackId: track.id }); track.clipOrder.splice(track.clipOrder.indexOf(clip.id), 1); delete draft.clips[clip.id]; removeRelatedTransitions(draft, clip.id); return; }
    case "timeline/rippleDelete": {
      const plan = planRippleDelete(current(draft), command.clipId); if (!plan.ok) throw plan.error; const clip = getClip(draft, command.clipId); const track = getTrack(draft, clip.trackId); track.clipOrder.splice(track.clipOrder.indexOf(clip.id), 1); delete draft.clips[clip.id]; removeRelatedTransitions(draft, clip.id);
      for (const id of plan.value.shiftedClipIds) { const other = draft.clips[id]; if (other) other.startUs = timeUs(other.startUs - plan.value.removedDurationUs); }
      for (const id of plan.value.shiftedCueIds) { const cue = draft.captionCues[id]; if (cue) { cue.startUs = timeUs(cue.startUs - plan.value.removedDurationUs); cue.endUs = timeUs(cue.endUs - plan.value.removedDurationUs); } }
      for (const id of draft.trackOrder) sortTrack(draft, id); draft.captionCueOrder.sort((a, b) => draft.captionCues[a]!.startUs - draft.captionCues[b]!.startUs || a.localeCompare(b)); return;
    }
    case "caption/add": { const track = getTrack(draft, command.cue.trackId); if (track.locked) reject("This lane is locked", { trackId: track.id }); if (track.kind !== "caption") reject("Captions must be placed on the Captions lane"); if (draft.captionCues[command.cue.id]) reject("Caption already exists"); if (!draft.textStyles[command.cue.textStyleId]) reject("Caption text style does not exist"); draft.captionCues[command.cue.id] = command.cue as never; draft.captionCueOrder.push(command.cue.id); draft.captionCueOrder.sort((a,b)=>draft.captionCues[a]!.startUs-draft.captionCues[b]!.startUs||a.localeCompare(b)); return; }
    case "caption/setTiming": { const cue = draft.captionCues[command.cueId]; if (!cue) reject("Caption no longer exists"); const track = getTrack(draft, cue.trackId); if (track.locked) reject("This lane is locked", { trackId: track.id }); if (command.endUs <= command.startUs) reject("A caption must be at least one frame long"); cue.startUs = command.startUs; cue.endUs = command.endUs; draft.captionCueOrder.sort((a,b)=>draft.captionCues[a]!.startUs-draft.captionCues[b]!.startUs||a.localeCompare(b)); return; }
    case "caption/update": { const cue = draft.captionCues[command.cueId]; if (!cue) reject("Caption no longer exists"); const track = getTrack(draft, cue.trackId); if (track.locked) reject("This lane is locked", { trackId: track.id }); if (command.text !== undefined) { if (!command.text.trim() || command.text.length > 10_000) reject("Caption text must contain text and stay below 10,000 characters"); cue.text = command.text.trim(); } if (command.position !== undefined) cue.position = command.position; if (command.textStyleId !== undefined) { if (!draft.textStyles[command.textStyleId]) reject("Caption text style does not exist"); cue.textStyleId = command.textStyleId; } if (command.emphasisWordIndexes !== undefined) cue.emphasisWordIndexes = [...command.emphasisWordIndexes] as never; return; }
    case "caption/replaceAll": { const captionTrackIds = new Set(Object.values(draft.tracks).filter((track) => track.kind === "caption").map((track) => track.id)); if (command.cues.length > 250) reject("A caption import is limited to 250 cues"); for (const cue of command.cues) { if (!captionTrackIds.has(cue.trackId) || !draft.textStyles[cue.textStyleId]) reject("Caption import references an invalid track or style"); } for (const id of [...draft.captionCueOrder]) delete draft.captionCues[id]; draft.captionCueOrder.splice(0); for (const cue of command.cues) { if (draft.captionCues[cue.id]) reject("Caption import contains duplicate IDs"); draft.captionCues[cue.id] = cue as never; draft.captionCueOrder.push(cue.id); } draft.captionCueOrder.sort((a,b)=>draft.captionCues[a]!.startUs-draft.captionCues[b]!.startUs||a.localeCompare(b)); return; }
    case "caption/setSettings": { const track = getTrack(draft, command.trackId); if (track.kind !== "caption") reject("Caption settings require a caption lane"); if (!Number.isInteger(command.maxWords) || command.maxWords < 1 || command.maxWords > 20) reject("Maximum caption words must be between 1 and 20"); if (!draft.textStyles[command.defaultTextStyleId]) reject("Caption default style does not exist"); draft.captionSettings[track.id] = { maxWords: command.maxWords, defaultTextStyleId: command.defaultTextStyleId } as never; return; }
    case "audio/add":
    case "audio/addSourceFromVideo": { const clip = command.clip; if (draft.clips[clip.id]) reject("Audio clip ID already exists", { clipId: clip.id }); if (command.type === "audio/addSourceFromVideo" && clip.role !== "source") reject("Source sound must use the source role"); assertAudioClip(draft, clip); draft.clips[clip.id] = clip as Draft<Clip>; getTrack(draft, clip.trackId).clipOrder.push(clip.id); sortTrack(draft, clip.trackId); return; }
    case "audio/setMix": { const clip = getClip(draft, command.clipId); if (clip.kind !== "audio") reject("Only audio clips have mix controls"); if (command.muted !== undefined) clip.muted = command.muted; if (command.volume !== undefined) { if (!Number.isFinite(command.volume) || command.volume < 0 || command.volume > 2) reject("Volume must be between 0 and 2"); clip.volume = command.volume; } if (command.fadeInUs !== undefined) clip.fadeInUs = command.fadeInUs; if (command.fadeOutUs !== undefined) clip.fadeOutUs = command.fadeOutUs; if (clip.fadeInUs + clip.fadeOutUs > clip.durationUs) reject("Audio fades cannot exceed the clip duration"); return; }
    case "audio/replaceAsset": { const clip = getClip(draft, command.clipId); if (clip.kind !== "audio") reject("Only audio clips can replace their source"); const asset = draft.assets[command.assetId]; if (!asset) reject("Replacement media does not exist"); if ((clip.role === "source" && asset.kind !== "video") || (clip.role !== "source" && asset.kind !== "audio")) reject("Replacement media is incompatible with audio role"); if (asset.durationUs !== undefined && clip.sourceInUs + clip.sourceDurationUs > asset.durationUs) reject("Replacement media is shorter than the existing audio edit"); clip.assetId = command.assetId; return; }
    case "template/compile": { const fragment = command.fragment; if (fragment.clips.length + fragment.captionCues.length > 100) reject("Template is too large"); const ids = new Set<string>(); for (const entity of [...fragment.clips, ...fragment.captionCues, ...fragment.textStyles, ...fragment.markers, ...fragment.transitions]) { if (ids.has(entity.id) || draft.clips[entity.id] || draft.captionCues[entity.id] || draft.textStyles[entity.id] || draft.markers[entity.id] || draft.transitions[entity.id]) reject("Template contains a duplicate entity ID", { entityId: entity.id }); ids.add(entity.id); } for (const style of fragment.textStyles) { draft.textStyles[style.id] = style as never; draft.textStyleOrder.push(style.id); } for (const clip of fragment.clips) { const track = getTrack(draft, clip.trackId); if (track.locked) reject("Template targets a locked lane", { trackId: track.id }); if (clip.kind === "audio") assertAudioClip(draft, clip); draft.clips[clip.id] = clip as Draft<Clip>; track.clipOrder.push(clip.id); sortTrack(draft, track.id); } for (const cue of fragment.captionCues) { if (!draft.textStyles[cue.textStyleId]) reject("Template caption references an invalid style"); draft.captionCues[cue.id] = cue as never; draft.captionCueOrder.push(cue.id); } draft.captionCueOrder.sort((a,b)=>draft.captionCues[a]!.startUs-draft.captionCues[b]!.startUs||a.localeCompare(b)); for (const marker of fragment.markers) { draft.markers[marker.id] = marker as never; draft.markerOrder.push(marker.id); } for (const transition of fragment.transitions) { draft.transitions[transition.id] = transition as never; draft.transitionOrder.push(transition.id); } return; }
    case "aurelius/applyStyle": { for (const style of command.textStyleUpdates) { if (!draft.textStyles[style.id]) reject("Style update references an unknown style", { styleId: style.id }); draft.textStyles[style.id] = style as never; } for (const update of command.clipUpdates) { const clip = getClip(draft, update.id); if (clip.kind !== "text") reject("Only text can receive an Aurelius style"); const detached = new Set(clip.aurelius?.detachedFields ?? []); if (update.textStyleId !== undefined && !detached.has("textStyleId")) { if (!draft.textStyles[update.textStyleId]) reject("Style update references an unknown style"); clip.textStyleId = update.textStyleId; } if (update.motion !== undefined && !detached.has("motion")) clip.motion = update.motion as never; } return; }
    case "aurelius/applyPacing": { for (const update of command.clipTimings) { const clip = getClip(draft, update.id); clip.startUs = update.startUs; clip.durationUs = update.durationUs; if (clip.kind === "text" && update.motion) clip.motion = update.motion as never; sortTrack(draft, clip.trackId); } for (const update of command.cueTimings) { const cue = draft.captionCues[update.id]; if (!cue) reject("Pacing update references an unknown caption"); cue.startUs = update.startUs; cue.endUs = update.endUs; } draft.captionCueOrder.sort((a,b)=>draft.captionCues[a]!.startUs-draft.captionCues[b]!.startUs||a.localeCompare(b)); return; }
    case "transition/add": { if (draft.transitions[command.transition.id]) reject("Transition already exists"); const plan = planTransition(current(draft), command.transition.fromClipId, command.transition.toClipId, command.transition.durationUs); if (!plan.ok) throw plan.error; draft.transitions[command.transition.id] = { ...command.transition, trackId: plan.value.trackId, durationUs: plan.value.durationUs } as never; draft.transitionOrder.push(command.transition.id); return; }
    case "transition/update": { const transition = draft.transitions[command.transitionId]; if (!transition) reject("Transition no longer exists"); const plan = planTransition(current(draft), transition.fromClipId, transition.toClipId, command.durationUs); if (!plan.ok) throw plan.error; transition.durationUs = plan.value.durationUs; if (command.kind) transition.kind = command.kind; return; }
    case "transition/remove": { if (!draft.transitions[command.transitionId]) reject("Transition no longer exists"); delete draft.transitions[command.transitionId]; const index = draft.transitionOrder.indexOf(command.transitionId); if (index >= 0) draft.transitionOrder.splice(index, 1); return; }
  }
}

export const foundationalCommandHandlers = {
  "project/rename": { label: () => "Rename project", apply: applyFoundationalCommand },
  "composition/setBackground": { label: () => "Change background", apply: applyFoundationalCommand },
  "composition/setFormat": { label: () => "Change canvas format", apply: applyFoundationalCommand },
  "asset/register": { label: () => "Add media", apply: applyFoundationalCommand },
  "asset/rename": { label: () => "Rename media", apply: applyFoundationalCommand },
  "asset/replaceMetadata": { label: () => "Replace media", apply: applyFoundationalCommand },
  "asset/remove": { label: () => "Remove media", apply: applyFoundationalCommand },
  "clip/add": { label: () => "Add clip", apply: applyFoundationalCommand },
  "clip/remove": { label: () => "Remove clip", apply: applyFoundationalCommand },
  "clip/setTiming": { label: () => "Change clip timing", apply: applyFoundationalCommand },
  "clip/setTransform": { label: () => "Transform layer", apply: applyFoundationalCommand },
  "clip/setCrop": { label: () => "Crop media", apply: applyFoundationalCommand },
  "clip/setLayer": { label: () => "Reorder layer", apply: applyFoundationalCommand },
  "text/setContent": { label: () => "Edit text", apply: applyFoundationalCommand },
  "text/add": { label: () => "Add text", apply: applyFoundationalCommand },
  "text/setMotion": { label: () => "Change text motion", apply: applyFoundationalCommand },
  "timeline/move": { label: () => "Move clip", apply: applyFoundationalCommand },
  "timeline/trim": { label: () => "Trim clip", apply: applyFoundationalCommand },
  "timeline/split": { label: () => "Split clip", apply: applyFoundationalCommand },
  "timeline/duplicate": { label: () => "Duplicate clip", apply: applyFoundationalCommand },
  "timeline/reorderLayer": { label: () => "Reorder layer", apply: applyFoundationalCommand },
  "timeline/delete": { label: () => "Delete clip", apply: applyFoundationalCommand },
  "timeline/rippleDelete": { label: () => "Ripple delete", apply: applyFoundationalCommand },
  "caption/add": { label: () => "Add caption", apply: applyFoundationalCommand },
  "caption/setTiming": { label: () => "Edit caption timing", apply: applyFoundationalCommand },
  "caption/update": { label: () => "Edit caption", apply: applyFoundationalCommand },
  "caption/replaceAll": { label: () => "Replace captions", apply: applyFoundationalCommand },
  "caption/setSettings": { label: () => "Set caption defaults", apply: applyFoundationalCommand },
  "audio/add": { label: () => "Add audio", apply: applyFoundationalCommand },
  "audio/addSourceFromVideo": { label: () => "Add source sound", apply: applyFoundationalCommand },
  "audio/setMix": { label: () => "Adjust audio mix", apply: applyFoundationalCommand },
  "audio/replaceAsset": { label: () => "Replace voiceover", apply: applyFoundationalCommand },
  "template/compile": { label: () => "Create Aurelius first cut", apply: applyFoundationalCommand },
  "aurelius/applyStyle": { label: () => "Apply Aurelius style", apply: applyFoundationalCommand },
  "aurelius/applyPacing": { label: () => "Apply pacing mode", apply: applyFoundationalCommand },
  "transition/add": { label: () => "Add transition", apply: applyFoundationalCommand },
  "transition/update": { label: () => "Change transition", apply: applyFoundationalCommand },
  "transition/remove": { label: () => "Remove transition", apply: applyFoundationalCommand },
} satisfies CommandHandlerRegistry;

export function registeredHandler(command: EditorCommand): CommandHandler<EditorCommand> {
  return foundationalCommandHandlers[command.type] as CommandHandler<EditorCommand>;
}
