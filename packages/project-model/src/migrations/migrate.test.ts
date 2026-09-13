import { describe, expect, it } from "vitest";
import v1 from "../__fixtures__/project-v1.json" with { type: "json" };
import v2 from "../__fixtures__/project-v2.json" with { type: "json" };
import { deriveProjectDurationUs } from "../validation";
import { loadProjectDoc } from "./migrate";

function observables(project: any) {
  return {
    revision: project.revision,
    trackOrder: project.trackOrder.filter((id: string) => project.tracks[id].kind !== "audio"),
    clipOrders: project.trackOrder.filter((id: string) => project.tracks[id].kind !== "audio").map((id: string) => project.tracks[id].clipOrder),
    clips: Object.fromEntries(Object.entries(project.clips).filter(([, clip]: [string, any]) => clip.kind !== "audio").map(([id, clip]: [string, any]) => [id, {
      startUs: clip.startUs, durationUs: clip.durationUs, sourceInUs: clip.sourceInUs,
      sourceDurationUs: clip.sourceDurationUs,
    }])),
    cues: Object.fromEntries(Object.entries(project.captionCues).map(([id, cue]: [string, any]) => [id, {
      id: cue.id, trackId: cue.trackId, startUs: cue.startUs, endUs: cue.endUs, text: cue.text, position: cue.position,
    }])),
  };
}

describe("project migrations", () => {
  it("migrates v1 through the current schema without changing creative semantics", () => {
    const sourceBefore = JSON.parse(JSON.stringify(v1));
    const result = loadProjectDoc(v1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.appliedMigrations).toEqual(["v1-to-v2", "v2-to-v3"]);
    expect(result.value.schemaVersion).toBe(3);
    expect(observables(result.value)).toEqual(observables(v2));
    expect(deriveProjectDurationUs(result.value)).toBe(4_500_000);
    expect(v1).toEqual(sourceBefore);
  });

  it("migrates v2 once and loads the resulting current document as an idempotent no-op", () => {
    const first = loadProjectDoc(v2);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.report.appliedMigrations).toEqual(["v2-to-v3"]);
    const second = loadProjectDoc(JSON.parse(JSON.stringify(first.value)));
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.report).toEqual({ sourceVersion: 3, targetVersion: 3, appliedMigrations: [] });
    expect(second.value).toEqual(first.value);
  });

  it("rejects future versions with update guidance and no project", () => {
    const result = loadProjectDoc({ ...v2, schemaVersion: 999 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("PROJECT_VERSION_TOO_NEW");
    expect(result.error.recoveryAction).toBe("update-app");
    expect(result.error.details).toMatchObject({ sourceVersion: 999, currentVersion: 3 });
    expect("value" in result).toBe(false);
  });

  it.each([
    ["missing version", { ...v1, schemaVersion: undefined }],
    ["migration gap", { ...v1, schemaVersion: 0 }],
    ["invalid migrated reference", { ...v1, clips: { ...v1.clips, "clip-1": { ...v1.clips["clip-1"], assetId: "absent" } } }],
  ])("fails %s safely and preserves original input", (_label, source) => {
    const before = JSON.parse(JSON.stringify(source));
    const result = loadProjectDoc(source);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("MIGRATION_FAILED");
    expect(source).toEqual(before);
  });
});
