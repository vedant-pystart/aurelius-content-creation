import type { Crop, ProjectDoc, Transform } from "@aurelius/project-model";
import type { AlignmentTarget, CropGeometry, LogicalRect, SafeAreas, TextLayout } from "./contracts";

export const LOGICAL_WIDTH = 1080 as const;
const DEFAULT_TRANSFORM: Transform = { x: .5, y: .5, scaleX: 1, scaleY: 1, rotationDeg: 0, opacity: 1 };
const DEFAULT_CROP: Crop = { mode: "fill", x: 0, y: 0, zoom: 1 };

export function defaultTransform(input?: Transform): Transform { return input ? { ...input } : DEFAULT_TRANSFORM; }
export function defaultCrop(input?: Crop): Crop { return input ? { ...input } : DEFAULT_CROP; }
export function safeAreasFor(height: ProjectDoc["composition"]["height"]): SafeAreas {
  const side = 60; const titleTop = 120; const bottom = Math.round(height * .13);
  return {
    content: { x: side, y: titleTop, width: LOGICAL_WIDTH - side * 2, height: height - titleTop - bottom },
    title: { x: side, y: titleTop, width: LOGICAL_WIDTH - side * 2, height: Math.round(height * .22) },
    bottomUi: { x: side, y: height - bottom, width: LOGICAL_WIDTH - side * 2, height: bottom - 36 },
  };
}
export function boundsForTransform(transformInput: Transform | undefined, height: number, base?: { width: number; height: number }): LogicalRect {
  const transform = defaultTransform(transformInput); const source = base ?? { width: LOGICAL_WIDTH, height };
  const width = source.width * transform.scaleX; const boxHeight = source.height * transform.scaleY;
  return { x: transform.x * LOGICAL_WIDTH - width / 2, y: transform.y * height - boxHeight / 2, width, height: boxHeight };
}
export function cropGeometry(cropInput: Crop | undefined, asset: { width?: number; height?: number } | undefined, canvas: { width: number; height: number }): CropGeometry {
  const crop = defaultCrop(cropInput); const sourceWidth = asset?.width ?? canvas.width; const sourceHeight = asset?.height ?? canvas.height;
  const sourceRatio = sourceWidth / sourceHeight; const canvasRatio = canvas.width / canvas.height;
  let width = sourceWidth; let height = sourceHeight;
  if (crop.mode !== "fit") {
    if (sourceRatio > canvasRatio) width = sourceHeight * canvasRatio;
    else height = sourceWidth / canvasRatio;
  }
  width /= crop.zoom; height /= crop.zoom;
  const maxX = Math.max(0, sourceWidth - width); const maxY = Math.max(0, sourceHeight - height);
  return { mode: crop.mode, sourceX: Math.round((maxX / 2) + crop.x * maxX / 2), sourceY: Math.round((maxY / 2) + crop.y * maxY / 2), sourceWidth: Math.round(width), sourceHeight: Math.round(height), blurBackdrop: crop.mode === "blur" };
}
export function measureTextLayout(content: string, style: ProjectDoc["textStyles"][string], maxWidth = 900): TextLayout {
  const fontSize = Math.max(12, Math.round(style.sizePx)); const avgChar = fontSize * (style.family === "Crimson Pro" ? .49 : .54) * (1 + style.letterSpacingEm);
  const perLine = Math.max(1, Math.floor(maxWidth / Math.max(1, avgChar)));
  const lines: string[] = [];
  for (const paragraph of content.split("\n")) {
    const words = paragraph.trim().split(/\s+/u).filter(Boolean); if (!words.length) { lines.push(""); continue; }
    let line = "";
    for (const word of words) { const next = line ? `${line} ${word}` : word; if (next.length > perLine && line) { lines.push(line); line = word; } else line = next; }
    lines.push(line);
  }
  return { lines, fontSize, lineHeight: Math.round(fontSize * style.lineHeight), align: style.align, fontFamily: style.family, weight: style.weight };
}
export function alignmentTargets(height: ProjectDoc["composition"]["height"], layers: readonly { id: string; bounds: LogicalRect }[], safeAreas = safeAreasFor(height)): readonly AlignmentTarget[] {
  const output: AlignmentTarget[] = [
    { id: "canvas-left", axis: "x", kind: "edge", value: 0 }, { id: "canvas-center-x", axis: "x", kind: "center", value: LOGICAL_WIDTH / 2 }, { id: "canvas-right", axis: "x", kind: "edge", value: LOGICAL_WIDTH },
    { id: "canvas-top", axis: "y", kind: "edge", value: 0 }, { id: "canvas-center-y", axis: "y", kind: "center", value: height / 2 }, { id: "canvas-bottom", axis: "y", kind: "edge", value: height },
  ];
  for (const [id, rect] of Object.entries({ "safe-content": safeAreas.content, "safe-title": safeAreas.title, "safe-bottom": safeAreas.bottomUi })) {
    output.push({ id: `${id}-left`, axis: "x", kind: "safe", value: rect.x }, { id: `${id}-center-x`, axis: "x", kind: "safe", value: rect.x + rect.width / 2 }, { id: `${id}-right`, axis: "x", kind: "safe", value: rect.x + rect.width }, { id: `${id}-top`, axis: "y", kind: "safe", value: rect.y }, { id: `${id}-middle`, axis: "y", kind: "safe", value: rect.y + rect.height / 2 }, { id: `${id}-bottom`, axis: "y", kind: "safe", value: rect.y + rect.height });
  }
  for (const layer of layers) output.push({ id: `${layer.id}-left`, axis: "x", kind: "edge", value: layer.bounds.x }, { id: `${layer.id}-center-x`, axis: "x", kind: "center", value: layer.bounds.x + layer.bounds.width / 2 }, { id: `${layer.id}-right`, axis: "x", kind: "edge", value: layer.bounds.x + layer.bounds.width }, { id: `${layer.id}-top`, axis: "y", kind: "edge", value: layer.bounds.y }, { id: `${layer.id}-middle`, axis: "y", kind: "center", value: layer.bounds.y + layer.bounds.height / 2 }, { id: `${layer.id}-bottom`, axis: "y", kind: "edge", value: layer.bounds.y + layer.bounds.height });
  return output;
}
