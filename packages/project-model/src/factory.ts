import { nanoid } from "nanoid";
import type { AspectHeight, ProjectDoc, TrackKind } from "./model";
import type { FrameRate } from "./time";

export interface CreateProjectOptions {
  readonly id?: string;
  readonly title?: string;
  readonly width: 1080;
  readonly height: AspectHeight;
  readonly frameRate: FrameRate;
  readonly nowIso?: string;
  readonly createId?: () => string;
}

const TRACKS: readonly [TrackKind, string][] = [
  ["primary", "Primary"], ["overlay", "Overlay"], ["text", "Text"],
  ["caption", "Captions"], ["audio", "Audio"],
];

export function createProjectDoc(options: CreateProjectOptions): ProjectDoc {
  const nextId = options.createId ?? nanoid;
  const now = options.nowIso ?? new Date().toISOString();
  const tracks: Record<string, ProjectDoc["tracks"][string]> = {};
  const trackOrder: string[] = [];
  for (const [kind, name] of TRACKS) {
    const id = `${kind}-${nextId()}`;
    trackOrder.push(id);
    tracks[id] = { id, name, kind, muted: false, locked: false, clipOrder: [] };
  }
  const defaultStyleId = `style-${nextId()}`;
  const captionStyleId = `style-caption-${nextId()}`;
  const captionTrackId = trackOrder.find((id) => tracks[id]?.kind === "caption");
  return {
    schemaVersion: 3,
    id: options.id ?? `project-${nextId()}`,
    revision: 0,
    title: options.title ?? "Untitled Aurelius Film",
    createdAt: now,
    updatedAt: now,
    composition: { width: options.width, height: options.height, frameRate: options.frameRate, background: "#FBF3E6" },
    brandTokens: {
      background: "#FBF3E6", text: "#2A2522", accent: "#8B5E34", border: "#E8DED1", gold: "#D4AF37",
      headingFont: "Crimson Pro", bodyFont: "Karla",
    },
    assetOrder: [], assets: {}, trackOrder, tracks, captionSettings: captionTrackId ? { [captionTrackId]: { maxWords: 8, defaultTextStyleId: captionStyleId } } : {}, clips: {},
    transitionOrder: [], transitions: {}, captionCueOrder: [], captionCues: {},
    textStyleOrder: [defaultStyleId, captionStyleId],
    textStyles: {
      [defaultStyleId]: {
        id: defaultStyleId, name: "Aurelius Editorial", family: "Crimson Pro", weight: 600,
        sizePx: 96, lineHeight: 1.05, letterSpacingEm: -0.02, color: "#2A2522", align: "center",
      },
      [captionStyleId]: { id: captionStyleId, name: "Aurelius Captions", family: "Karla", weight: 600, sizePx: 48, lineHeight: 1.12, letterSpacingEm: 0, color: "#2A2522", align: "center" },
    },
    markerOrder: [], markers: {},
  } as ProjectDoc;
}
