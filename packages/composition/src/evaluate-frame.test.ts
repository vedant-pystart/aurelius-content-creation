import { describe, expect, it } from "vitest";
import { createProjectDoc, timeUs, type ProjectDoc } from "@aurelius/project-model";
import { evaluateFrame } from "./evaluate-frame";
import { alignmentTargets, cropGeometry, safeAreasFor } from "./layout";

function project(): ProjectDoc {
  const doc = createProjectDoc({ id: "project-canvas", createId: (() => { let value = 0; return () => `${++value}`; })(), width: 1080, height: 1920, frameRate: { numerator: 30, denominator: 1 }, nowIso: "2026-09-12T00:00:00.000Z" });
  const primary = doc.trackOrder.map((id) => doc.tracks[id]!).find((track) => track.kind === "primary")!; const text = doc.trackOrder.map((id) => doc.tracks[id]!).find((track) => track.kind === "text")!; const styleId = doc.textStyleOrder[0]!;
  return { ...doc, assets: { image: { id: "image", name: "Image", kind: "image", mimeType: "image/jpeg", byteSize: 1, width: 1600, height: 900, fingerprint: "image" } }, assetOrder: ["image"], clips: { image: { id: "image", trackId: primary.id, startUs: timeUs(0), durationUs: timeUs(2_000_000), layer: 1, enabled: true, kind: "image", assetId: "image", sourceInUs: timeUs(0), sourceDurationUs: timeUs(2_000_000), transform: { x: .5, y: .5, scaleX: 1, scaleY: 1, rotationDeg: 0, opacity: 1 }, crop: { mode: "blur", x: .2, y: -.2, zoom: 1.2 }, volume: 1, fadeInUs: timeUs(0), fadeOutUs: timeUs(0) }, text: { id: "text", trackId: text.id, startUs: timeUs(0), durationUs: timeUs(2_000_000), layer: 2, enabled: true, kind: "text", content: "Aurelius makes room for a useful thought", textStyleId: styleId, transform: { x: .5, y: .45, scaleX: 1, scaleY: 1, rotationDeg: 0, opacity: 1 }, motion: { treatment: "none", entranceUs: timeUs(0), holdUs: timeUs(2_000_000), exitUs: timeUs(0), staggerUs: timeUs(0) } } }, tracks: { ...doc.tracks, [primary.id]: { ...primary, clipOrder: ["image"] }, [text.id]: { ...text, clipOrder: ["text"] } } };
}

describe("evaluateFrame", () => {
  it("resolves stable media, text, crop, and canonical order", () => { const doc = project(); expect(evaluateFrame(doc, 0)).toEqual(evaluateFrame(JSON.parse(JSON.stringify(doc)), 0)); const result = evaluateFrame(doc, 0); expect(result.layers.map((layer) => layer.id)).toEqual(["image", "text"]); expect(result.layers[0]?.crop?.mode).toBe("blur"); expect(result.layers[1]?.text?.lines).toEqual(["Aurelius makes room", "for a useful", "thought"]); expect(evaluateFrame(doc, 60).layers).toHaveLength(0); });
  it("keeps logical safe zones and crop geometry deterministic across formats", () => { expect(safeAreasFor(1920).content.width).toBe(960); expect(safeAreasFor(1350).content.height).toBeLessThan(safeAreasFor(1920).content.height); expect(cropGeometry({ mode: "fill", x: 0, y: 0, zoom: 1 }, { width: 1600, height: 900 }, { width: 1080, height: 1920 }).sourceWidth).toBeLessThan(1600); expect(alignmentTargets(1080, []).some((target) => target.id === "canvas-center-x")).toBe(true); });
});
