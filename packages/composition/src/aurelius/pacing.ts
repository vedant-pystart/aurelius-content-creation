import { timeUs, type EditorCommand, type ProjectDoc } from "@aurelius/project-model";
import type { AureliusPacing, PacingScope } from "./contracts";

const profile = {
  calm: { factor: 1.28, entrance: 520_000, hold: 2_900_000 },
  engaging: { factor: 1, entrance: 320_000, hold: 2_100_000 },
  "high-retention": { factor: .72, entrance: 180_000, hold: 1_380_000 },
} as const;

export function planAureliusPacing(project: ProjectDoc, mode: AureliusPacing, scope: PacingScope = "all"): EditorCommand {
  const allowed = scope === "all" ? undefined : new Set(scope); const p = profile[mode]; let cursor = 0;
  const clips = project.trackOrder.flatMap((trackId) => project.tracks[trackId]?.clipOrder ?? []).map((id) => project.clips[id]).filter((clip): clip is NonNullable<typeof clip> => !!clip && (!allowed || allowed.has(clip.id))).filter((clip) => clip.kind === "text");
  const clipTimings = clips.map((clip) => { const duration = Math.max(900_000, Math.round(clip.durationUs * p.factor)); const next = { id: clip.id, startUs: timeUs(cursor), durationUs: timeUs(duration), motion: { ...clip.motion, entranceUs: timeUs(Math.min(p.entrance, duration / 3)), holdUs: timeUs(Math.max(0, Math.min(p.hold, duration - p.entrance - clip.motion.exitUs))) } }; cursor += duration; return next; });
  const cueTimings = project.captionCueOrder.map((id) => project.captionCues[id]).filter((cue): cue is NonNullable<typeof cue> => !!cue && (!allowed || allowed.has(cue.id))).map((cue) => ({ id: cue.id, startUs: cue.startUs, endUs: cue.endUs }));
  return { type: "aurelius/applyPacing", expectedRevision: project.revision, clipTimings, cueTimings };
}

export const pacingSummary: Record<AureliusPacing, string> = { calm: "Longer holds and gentler entrances", engaging: "Balanced changes with editorial rhythm", "high-retention": "Tighter early beats and a clear payoff" };
