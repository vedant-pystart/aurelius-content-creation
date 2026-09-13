import { createProjectDoc } from "../factory";
import type { ProjectDoc } from "../model";
import { assertValidProjectDoc } from "../validation";

export const FIXED_NOW = "2026-09-12T08:00:00.000Z";

export function emptyProject(height: 1920 | 1350 | 1080 = 1920, fps: 24 | 30 | 60 = 30): ProjectDoc {
  let counter = 0;
  return createProjectDoc({
    id: `project-${height}-${fps}`,
    title: "Fixture Project",
    width: 1080,
    height,
    frameRate: { numerator: fps, denominator: 1 },
    nowIso: FIXED_NOW,
    createId: () => String(++counter),
  });
}

export function populatedProject(height: 1920 | 1350 | 1080 = 1920, fps: 24 | 30 | 60 = 30): ProjectDoc {
  const base = emptyProject(height, fps);
  const primaryId = base.trackOrder.find((id) => base.tracks[id]?.kind === "primary")!;
  const overlayId = base.trackOrder.find((id) => base.tracks[id]?.kind === "overlay")!;
  const textId = base.trackOrder.find((id) => base.tracks[id]?.kind === "text")!;
  const captionId = base.trackOrder.find((id) => base.tracks[id]?.kind === "caption")!;
  const styleId = base.textStyleOrder[0]!;
  const clips: Record<string, unknown> = {
    "clip-a": {
      id: "clip-a", trackId: primaryId, kind: "video", startUs: 0, durationUs: 2_000_000,
      layer: 0, enabled: true, assetId: "asset-video", sourceInUs: 500_000, sourceDurationUs: 2_000_000,
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0, opacity: 1 },
      crop: { mode: "fill", x: 0.5, y: 0.5, zoom: 1 }, volume: 1, fadeInUs: 0, fadeOutUs: 0,
    },
    "clip-b": {
      id: "clip-b", trackId: primaryId, kind: "video", startUs: 2_000_000, durationUs: 2_000_000,
      layer: 0, enabled: true, assetId: "asset-video", sourceInUs: 500_000, sourceDurationUs: 2_000_000,
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0, opacity: 1 },
      crop: { mode: "fill", x: 0.5, y: 0.5, zoom: 1 }, volume: 1, fadeInUs: 0, fadeOutUs: 0,
    },
    "clip-overlay": {
      id: "clip-overlay", trackId: overlayId, kind: "image", startUs: 750_000, durationUs: 2_000_000,
      layer: 1, enabled: true, assetId: "asset-image", sourceInUs: 0, sourceDurationUs: 2_000_000,
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0, opacity: 0.8 },
      crop: { mode: "fit", x: 0.5, y: 0.5, zoom: 1 }, volume: 0, fadeInUs: 0, fadeOutUs: 0,
    },
    "clip-text": {
      id: "clip-text", trackId: textId, kind: "text", startUs: 1_000_000, durationUs: 2_000_000,
      layer: 2, enabled: true, content: "What matters is what you do next.", textStyleId: styleId,
      transform: { x: 540, y: 960, scaleX: 1, scaleY: 1, rotationDeg: 0, opacity: 1 },
      motion: { treatment: "editorial-rise", entranceUs: 300_000, holdUs: 1_400_000, exitUs: 300_000, staggerUs: 30_000 },
    },
  };
  return assertValidProjectDoc({
    ...base,
    assetOrder: ["asset-video", "asset-image"],
    assets: {
      "asset-video": { id: "asset-video", name: "Source", kind: "video", mimeType: "video/mp4", byteSize: 1000, durationUs: 5_000_000, width: 1920, height: 1080, fingerprint: "video-hash" },
      "asset-image": { id: "asset-image", name: "Still", kind: "image", mimeType: "image/png", byteSize: 500, width: 1200, height: 1200, fingerprint: "image-hash" },
    },
    tracks: {
      ...base.tracks,
      [primaryId]: { ...base.tracks[primaryId]!, clipOrder: ["clip-a", "clip-b"] },
      [overlayId]: { ...base.tracks[overlayId]!, clipOrder: ["clip-overlay"] },
      [textId]: { ...base.tracks[textId]!, clipOrder: ["clip-text"] },
    },
    clips,
    captionCueOrder: ["caption-1", "caption-2"],
    captionCues: {
      "caption-1": { id: "caption-1", trackId: captionId, startUs: 250_000, endUs: 1_250_000, text: "A useful thought", emphasisWordIndexes: [1], position: "lower", textStyleId: base.captionSettings[captionId]!.defaultTextStyleId },
      "caption-2": { id: "caption-2", trackId: captionId, startUs: 1_250_000, endUs: 2_250_000, text: "for the work ahead", emphasisWordIndexes: [3], position: "lower", textStyleId: base.captionSettings[captionId]!.defaultTextStyleId },
    },
    markerOrder: ["marker-1"],
    markers: { "marker-1": { id: "marker-1", timeUs: 2_000_000, label: "Second beat", color: "#D4AF37" } },
  });
}
