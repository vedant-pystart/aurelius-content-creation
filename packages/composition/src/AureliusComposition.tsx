import { AbsoluteFill, useCurrentFrame } from "remotion";
import type { ProjectDoc } from "@aurelius/project-model";
import { evaluateFrame } from "./evaluate-frame";
import type { ResolvedLayer } from "./contracts";
import type { AssetSourceMap } from "./media";
import { sourceForAsset } from "./media";
import { AURELIUS_FONT_STACKS } from "./fonts";

export interface AureliusCompositionProps {
  readonly project: ProjectDoc;
  readonly assetSources: AssetSourceMap;
  readonly showSafeAreas?: boolean | undefined;
}

function layerStyle(layer: ResolvedLayer): React.CSSProperties {
  const { bounds, transform } = layer;
  return { position: "absolute", left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height, opacity: layer.opacity, transform: `rotate(${transform.rotationDeg}deg)`, transformOrigin: "center", overflow: "hidden" };
}

function RecoveryLayer({ label }: { label: string }) { return <div data-testid="missing-media" style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", padding: 32, background: "#E8DED1", color: "#8B5E34", fontFamily: AURELIUS_FONT_STACKS.body, textAlign: "center", fontSize: 28 }}>Relink {label}</div>; }

function VisualLayer({ layer, sources }: { layer: ResolvedLayer; sources: AssetSourceMap }) {
  if (layer.kind === "text" && layer.text) return <div data-layer-id={layer.id} data-layer-kind="text" style={{ ...layerStyle(layer), display: "grid", alignItems: "center", color: "#2A2522", fontFamily: layer.text.fontFamily === "Crimson Pro" ? AURELIUS_FONT_STACKS.heading : AURELIUS_FONT_STACKS.body, fontSize: layer.text.fontSize, fontWeight: layer.text.weight, lineHeight: `${layer.text.lineHeight}px`, textAlign: layer.text.align, whiteSpace: "pre-wrap" }}>{layer.text.lines.join("\n")}</div>;
  const source = layer.assetId ? sourceForAsset(sources, layer.assetId) : undefined;
  if (!source) return <div data-layer-id={layer.id} style={layerStyle(layer)}><RecoveryLayer label={layer.kind} /></div>;
  const position = layer.crop ? `${50 + layer.crop.sourceX / Math.max(1, layer.crop.sourceWidth) * 50}% ${50 + layer.crop.sourceY / Math.max(1, layer.crop.sourceHeight) * 50}%` : "center";
  const mediaStyle: React.CSSProperties = { width: "100%", height: "100%", objectFit: layer.crop?.mode === "fit" ? "contain" : "cover", objectPosition: position, display: "block" };
  return <div data-layer-id={layer.id} data-layer-kind={layer.kind} style={{ ...layerStyle(layer), background: layer.crop?.blurBackdrop ? "#57443A" : undefined }}>
    {layer.crop?.blurBackdrop ? <img src={source} aria-hidden="true" style={{ ...mediaStyle, position: "absolute", inset: 0, filter: "blur(32px)", transform: "scale(1.13)", opacity: .65 }} /> : null}
    {layer.kind === "image" ? <img src={source} alt="" style={{ ...mediaStyle, position: "relative" }} /> : <video src={source} muted playsInline style={{ ...mediaStyle, position: "relative" }} />}
  </div>;
}

export function AureliusComposition({ project, assetSources, showSafeAreas = false }: AureliusCompositionProps) {
  const frameIndex = useCurrentFrame(); const frame = evaluateFrame(project, frameIndex);
  return <AbsoluteFill data-testid="aurelius-composition" style={{ background: frame.background, overflow: "hidden" }}>
    {frame.layers.map((layer) => <VisualLayer key={layer.id} layer={layer} sources={assetSources} />)}
    {showSafeAreas ? <><div data-testid="safe-content" style={{ position: "absolute", border: "2px dashed #D4AF37", pointerEvents: "none", left: frame.safeAreas.content.x, top: frame.safeAreas.content.y, width: frame.safeAreas.content.width, height: frame.safeAreas.content.height }} /><div data-testid="safe-bottom" style={{ position: "absolute", borderTop: "2px dashed #D4AF37", pointerEvents: "none", left: frame.safeAreas.bottomUi.x, top: frame.safeAreas.bottomUi.y, width: frame.safeAreas.bottomUi.width }} /></> : null}
  </AbsoluteFill>;
}
