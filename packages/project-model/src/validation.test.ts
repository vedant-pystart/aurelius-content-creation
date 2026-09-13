import { describe, expect, it } from "vitest";
import { populatedProject } from "./__fixtures__/projects";
import { deriveProjectDurationUs, validateCurrentProjectDoc } from "./validation";

function mutableClone(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(populatedProject())) as Record<string, unknown>;
}

describe("project graph validation", () => {
  it("accepts adjacent primary clips and derives duration", () => {
    const project = populatedProject();
    expect(validateCurrentProjectDoc(project).ok).toBe(true);
    expect(deriveProjectDurationUs(project)).toBe(4_000_000);
  });

  it("accepts a transition with adjacent clips and sufficient source handles", () => {
    const input: any = mutableClone();
    input.transitionOrder = ["transition-1"];
    input.transitions = { "transition-1": { id: "transition-1", trackId: input.trackOrder[0], fromClipId: "clip-a", toClipId: "clip-b", kind: "crossfade", durationUs: 250000 } };
    expect(validateCurrentProjectDoc(input).ok).toBe(true);
  });

  it.each([
    ["missing asset", (doc: any) => { doc.clips["clip-a"].assetId = "missing"; }, "MISSING_ASSET_REFERENCE"],
    ["record mismatch", (doc: any) => { doc.clips["clip-a"].id = "wrong"; }, "RECORD_ID_MISMATCH"],
    ["duplicate IDs", (doc: any) => { doc.markers["marker-1"].id = "clip-a"; }, "DUPLICATE_ENTITY_ID"],
    ["primary overlap", (doc: any) => { doc.clips["clip-b"].startUs = 1_999_999; }, "PRIMARY_OVERLAP"],
    ["caption overlap", (doc: any) => { doc.captionCues["caption-2"].startUs = 1_249_999; }, "CAPTION_OVERLAP"],
    ["caption ordering", (doc: any) => { doc.captionCueOrder.reverse(); }, "UNSORTED_CAPTION_ORDER"],
    ["source bounds", (doc: any) => { doc.clips["clip-a"].sourceDurationUs = 5_000_000; }, "SOURCE_OUT_OF_BOUNDS"],
    ["bad membership", (doc: any) => { doc.tracks[doc.trackOrder[1]].clipOrder = ["clip-a"]; }, "DUPLICATE_CLIP_MEMBERSHIP"],
    ["wrong kind", (doc: any) => { doc.clips["clip-a"].trackId = doc.trackOrder[4]; }, "CLIP_TRACK_MISMATCH"],
    ["bad word index", (doc: any) => { doc.captionCues["caption-1"].emphasisWordIndexes = [99]; }, "INVALID_WORD_INDEX"],
    ["missing transition reference", (doc: any) => {
      doc.transitionOrder = ["transition-1"];
      doc.transitions = { "transition-1": { id: "transition-1", trackId: doc.trackOrder[0], fromClipId: "clip-a", toClipId: "missing", kind: "crossfade", durationUs: 250000 } };
    }, "MISSING_TRANSITION_REFERENCE"],
    ["transition handle", (doc: any) => {
      doc.transitionOrder = ["transition-1"];
      doc.transitions = { "transition-1": { id: "transition-1", trackId: doc.trackOrder[0], fromClipId: "clip-a", toClipId: "clip-b", kind: "crossfade", durationUs: 600000 } };
    }, "TRANSITION_HANDLE_SHORT"],
  ])("rejects %s with an actionable issue", (_name, mutate, expectedCode) => {
    const input = mutableClone();
    mutate(input);
    const result = validateCurrentProjectDoc(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.recoveryAction).toBe("fix-or-relink-project-data");
      expect(result.error.issues.some((item) => item.code === expectedCode)).toBe(true);
      expect(result.error.diagnosticId).toMatch(/^PROJECT_/);
    }
  });

  it("rejects negative/fractional timing at schema ingress", () => {
    for (const value of [-1, 0.5]) {
      const input: any = mutableClone(); input.clips["clip-a"].startUs = value;
      const result = validateCurrentProjectDoc(input);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("MALFORMED_PROJECT");
    }
  });
});
