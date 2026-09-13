import { ProjectModelError } from "../errors";
import type { MigrationStep } from "./types";

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ProjectModelError("MIGRATION_FAILED", `Version 2 ${label} is missing`, "restore-last-known-good-or-export-original", {});
  return value as Record<string, unknown>;
}

function freshId(base: string, taken: Set<string>): string {
  let candidate = base; let number = 2;
  while (taken.has(candidate)) candidate = `${base}-${number++}`;
  taken.add(candidate); return candidate;
}

/** Materializes independent audio without modifying source JSON or visual timing. */
export const migrateV2ToV3: MigrationStep<2, 3> = {
  fromVersion: 2, toVersion: 3, id: "v2-to-v3",
  migrate(input) {
    const source = record(input, "project"); const tracks = record(source.tracks, "tracks"); const clips = record(source.clips, "clips");
    const assets = record(source.assets, "assets"); const textStyles = record(source.textStyles, "text styles");
    const trackOrder = Array.isArray(source.trackOrder) ? [...source.trackOrder] as string[] : [];
    let audioTrackId = trackOrder.find((id) => record(tracks[id], `track ${id}`).kind === "audio");
    const captionTrackId = trackOrder.find((id) => record(tracks[id], `track ${id}`).kind === "caption");
    if (!captionTrackId) throw new ProjectModelError("MIGRATION_FAILED", "Version 2 project is missing a caption lane", "restore-last-known-good-or-export-original", {});
    const firstStyleId = (Array.isArray(source.textStyleOrder) ? source.textStyleOrder[0] : undefined) as string | undefined;
    if (!firstStyleId || !textStyles[firstStyleId]) throw new ProjectModelError("MIGRATION_FAILED", "Version 2 project has no usable text style", "restore-last-known-good-or-export-original", {});
    const taken = new Set([...Object.keys(tracks), ...Object.keys(clips), ...Object.keys(assets), ...Object.keys(textStyles)]);
    const tracksWithAudio = { ...tracks };
    if (!audioTrackId) { audioTrackId = freshId("track-audio", taken); tracksWithAudio[audioTrackId] = { id: audioTrackId, name: "Audio", kind: "audio", muted: false, locked: false, clipOrder: [] }; trackOrder.push(audioTrackId); }
    const nextClips: Record<string, unknown> = { ...clips };
    const audioTrack = record(tracksWithAudio[audioTrackId], "audio track"); const existingAudioOrder = Array.isArray(audioTrack.clipOrder) ? [...audioTrack.clipOrder] as string[] : [];
    const materialized: string[] = [];
    for (const [clipId, rawClip] of Object.entries(clips).sort(([a], [b]) => a.localeCompare(b))) {
      const clip = record(rawClip, `clip ${clipId}`);
      if (clip.kind === "audio") {
        nextClips[clipId] = { ...clip, role: "music", muted: false };
        continue;
      }
      if (clip.kind !== "video") continue;
      const sourceId = freshId(`source-audio-${clipId}`, taken);
      nextClips[sourceId] = {
        id: sourceId, kind: "audio", role: "source", trackId: audioTrackId, startUs: clip.startUs, durationUs: clip.durationUs,
        layer: 0, enabled: clip.enabled, assetId: clip.assetId, sourceInUs: clip.sourceInUs, sourceDurationUs: clip.sourceDurationUs,
        muted: false, volume: clip.volume ?? 1, fadeInUs: clip.fadeInUs ?? 0, fadeOutUs: clip.fadeOutUs ?? 0,
      };
      materialized.push(sourceId);
    }
    const allAudio = [...existingAudioOrder, ...materialized].sort((left, right) => {
      const a = record(nextClips[left], `clip ${left}`); const b = record(nextClips[right], `clip ${right}`);
      return Number(a.startUs) - Number(b.startUs) || left.localeCompare(right);
    });
    const nextTracks = { ...tracksWithAudio, [audioTrackId]: { ...audioTrack, clipOrder: allAudio } };
    const nextCaptions: Record<string, unknown> = {};
    for (const [id, rawCue] of Object.entries(record(source.captionCues, "captions"))) nextCaptions[id] = { ...record(rawCue, `caption ${id}`), textStyleId: firstStyleId };
    return { ...source, schemaVersion: 3, trackOrder, tracks: nextTracks, clips: nextClips, captionCues: nextCaptions, captionSettings: { [captionTrackId]: { maxWords: 8, defaultTextStyleId: firstStyleId } } };
  },
};
