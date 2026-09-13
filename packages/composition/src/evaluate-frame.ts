import { frameIndex as toFrameIndex, frameIndexToTimeUs, type ProjectDoc } from "@aurelius/project-model";
import type { ResolvedFrame, ResolvedLayer } from "./contracts";
import { alignmentTargets, boundsForTransform, cropGeometry, defaultTransform, measureTextLayout, safeAreasFor } from "./layout";
import { resolveAureliusMotion } from "./aurelius/motion";

export function evaluateFrame(project: ProjectDoc, requestedFrameIndex: number): ResolvedFrame {
  const exactFrame = Math.max(0, Math.floor(requestedFrameIndex)); const timeUs = frameIndexToTimeUs(toFrameIndex(exactFrame), project.composition.frameRate); const height = project.composition.height;
  const layers: ResolvedLayer[] = [];
  for (const [trackIndex, trackId] of project.trackOrder.entries()) {
    const track = project.tracks[trackId]; if (!track || track.muted) continue;
    for (const clipId of track.clipOrder) {
      const clip = project.clips[clipId]; if (!clip || !clip.enabled || clip.kind === "audio" || timeUs < clip.startUs || timeUs >= clip.startUs + clip.durationUs) continue;
      const transform = defaultTransform(clip.transform); const sourceTimeUs = clip.kind === "text" ? undefined : clip.sourceInUs + (timeUs - clip.startUs);
      if (clip.kind === "text") {
        const style = project.textStyles[clip.textStyleId]; if (!style) continue; const text = measureTextLayout(clip.content, style); const box = { width: Math.min(900, Math.max(160, Math.max(...text.lines.map((line) => line.length), 1) * text.fontSize * .62)), height: Math.max(text.lineHeight, text.lines.length * text.lineHeight) };
        const motion = resolveAureliusMotion(clip.motion, clip.durationUs, timeUs - clip.startUs); const animatedTransform = { ...transform, y: transform.y + motion.translateY / height, scaleX: transform.scaleX * motion.scale, scaleY: transform.scaleY * motion.scale };
        layers.push({ id: clip.id, kind: "text", visible: true, layer: clip.layer, trackIndex, compositionTimeUs: timeUs, transform: animatedTransform, bounds: boundsForTransform(animatedTransform, height, box), opacity: transform.opacity * motion.opacity, text });
      } else {
        const asset = project.assets[clip.assetId]; const crop = cropGeometry(clip.crop, asset, { width: 1080, height });
        layers.push({ id: clip.id, kind: clip.kind, assetId: clip.assetId, visible: true, layer: clip.layer, trackIndex, compositionTimeUs: timeUs, sourceTimeUs, transform, bounds: boundsForTransform(transform, height), crop, opacity: transform.opacity });
      }
    }
  }
  layers.sort((a, b) => a.layer - b.layer || a.trackIndex - b.trackIndex || a.id.localeCompare(b.id));
  return { frameIndex: exactFrame, timeUs, width: 1080, height, background: project.composition.background, safeAreas: safeAreasFor(height), layers };
}

export { alignmentTargets };
