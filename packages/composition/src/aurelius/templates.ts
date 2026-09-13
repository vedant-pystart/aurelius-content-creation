import { timeUs, type AureliusStyleBinding, type Clip, type EditorCommand, type ProjectDoc, type TextClip } from "@aurelius/project-model";
import type { TemplateInput } from "./contracts";
import { styleForProject } from "./styles";

const ensure = (value: string | undefined, field: string) => { const text = value?.trim(); if (!text || text.length > 2_000) throw new Error(`${field} is required and must be under 2,000 characters.`); return text; };
const track = (project: ProjectDoc, kind: string) => { const result = project.trackOrder.map((id) => project.tracks[id]).find((candidate) => candidate?.kind === kind); if (!result) throw new Error(`This project is missing its ${kind} lane.`); return result; };
const text = (input: { id: string; trackId: string; styleId: string; content: string; startUs: number; durationUs: number; role: AureliusStyleBinding["role"] }): TextClip => ({ id: input.id, kind: "text", trackId: input.trackId, startUs: timeUs(input.startUs), durationUs: timeUs(input.durationUs), layer: 10, enabled: true, content: input.content, textStyleId: input.styleId, transform: { x: .5, y: input.role === "end-card" ? .5 : .44, scaleX: 1, scaleY: 1, rotationDeg: 0, opacity: 1 }, motion: { treatment: input.role === "end-card" ? "film-title-fade" : "editorial-rise", entranceUs: timeUs(360_000), holdUs: timeUs(Math.max(0, input.durationUs - 720_000)), exitUs: timeUs(360_000), staggerUs: timeUs(70_000) }, aurelius: { preset: "editorial", role: input.role, detachedFields: [] } });

/** Compiles input into standard project-model entities; no opaque generator state survives. */
export function compileAureliusTemplate(project: ProjectDoc, input: TemplateInput): EditorCommand {
  const primary = track(project, "primary"); const textTrack = track(project, "text"); const captionTrack = track(project, "caption"); const style = input.style ?? "editorial"; const styleId = `style-${input.createId()}`; const hook = ensure(input.hook, "Primary copy"); const body = input.body?.trim(); const closing = input.closing?.trim() || "AURELIUS"; const clips: Clip[] = []; const markers = [] as ProjectDoc["markers"][string][];
  const addText = (content: string, start: number, duration: number, role: AureliusStyleBinding["role"]) => { const id = `text-${input.createId()}`; clips.push(text({ id, trackId: textTrack.id, styleId, content, startUs: start, durationUs: duration, role })); markers.push({ id: `marker-${input.createId()}`, timeUs: timeUs(start), label: role, color: "#D4AF37" }); };
  if (input.template === "nuclear-quote") { addText(hook, 0, 4_200_000, "quote"); if (input.attribution) addText(input.attribution.trim(), 3_100_000, 1_400_000, "credit"); addText(closing, 4_800_000, 1_800_000, "end-card"); }
  if (input.template === "hook-reel") { addText(hook, 0, 2_300_000, "heading"); if (body) addText(body, 2_300_000, 2_800_000, "body"); addText(closing, body ? 5_100_000 : 2_500_000, 1_700_000, "end-card"); }
  if (input.template === "movie-clip") {
    const asset = input.videoAssetId ? project.assets[input.videoAssetId] : undefined; if (!asset || asset.kind !== "video") throw new Error("Choose a ready video from this project before making a Movie Clip reel.");
    const duration = timeUs(Math.min(asset.durationUs ?? timeUs(4_000_000), timeUs(8_000_000))); const videoId = `video-${input.createId()}`;
    clips.push({ id: videoId, kind: "video", trackId: primary.id, startUs: timeUs(0), durationUs: duration, layer: 0, enabled: true, assetId: asset.id, sourceInUs: timeUs(0), sourceDurationUs: duration, volume: 1, fadeInUs: timeUs(0), fadeOutUs: timeUs(0) });
    addText(hook, 200_000, Math.min(2_600_000, duration), "heading"); addText(closing, Number(duration), 1_700_000, "end-card");
  }
  const captionSettings = project.captionSettings[captionTrack.id]; if (!captionSettings) throw new Error("This project is missing caption defaults."); const caption = body ? [{ id: `caption-${input.createId()}`, trackId: captionTrack.id, startUs: timeUs(0), endUs: timeUs(Math.min(3_000_000, clips[0]?.durationUs ?? 3_000_000)), text: body, emphasisWordIndexes: [], position: "lower" as const, textStyleId: captionSettings.defaultTextStyleId }] : [];
  return { type: "template/compile", expectedRevision: project.revision, fragment: { clips, captionCues: caption, textStyles: [styleForProject(project, style, styleId)], markers, transitions: [] } };
}
