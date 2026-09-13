import { describe, expect, it } from "vitest";
import { emptyProject, populatedProject } from "../__fixtures__/projects";
import { ProjectModelError } from "../errors";
import type { TextClip } from "../model";
import { timeUs } from "../time";
import { applyTransactionForward, applyTransactionInverse, executeCommand } from "./execute";

const committedAtIso = "2026-09-12T09:00:00.000Z";

describe("semantic command execution", () => {
  it.each([
    ["project/rename", (revision: number) => ({ type: "project/rename" as const, expectedRevision: revision, title: "A Better Cut" })],
    ["composition/setBackground", (revision: number) => ({ type: "composition/setBackground" as const, expectedRevision: revision, color: "#112233" })],
    ["clip/setTiming", (revision: number) => ({ type: "clip/setTiming" as const, expectedRevision: revision, clipId: "clip-overlay", startUs: timeUs(800_000), durationUs: timeUs(1_900_000), sourceDurationUs: timeUs(1_900_000) })],
  ])("executes and exactly reverses %s", (_name, makeCommand) => {
    const base = populatedProject();
    const { nextDoc, transaction } = executeCommand(base, makeCommand(base.revision), { committedAtIso });
    expect(nextDoc.revision).toBe(base.revision + 1);
    expect(nextDoc.updatedAt).toBe(committedAtIso);
    expect(transaction.label).not.toHaveLength(0);
    expect(applyTransactionInverse(nextDoc, transaction)).toEqual(base);
    expect(applyTransactionForward(base, transaction)).toEqual(nextDoc);
    expect(populatedProject()).toEqual(base);
  });

  it("adds and removes normalized clips as one transaction each", () => {
    const base = emptyProject();
    const textTrackId = base.trackOrder.find((id) => base.tracks[id]?.kind === "text")!;
    const clip: TextClip = {
      id: "new-text", trackId: textTrackId, kind: "text", startUs: timeUs(0), durationUs: timeUs(1_000_000), layer: 0,
      enabled: true, content: "Begin.", textStyleId: base.textStyleOrder[0]!,
      transform: { x: 540, y: 960, scaleX: 1, scaleY: 1, rotationDeg: 0, opacity: 1 },
      motion: { treatment: "none", entranceUs: timeUs(0), holdUs: timeUs(1_000_000), exitUs: timeUs(0), staggerUs: timeUs(0) },
    };
    const added = executeCommand(base, { type: "clip/add", expectedRevision: 0, clip }, { committedAtIso });
    const removed = executeCommand(added.nextDoc, { type: "clip/remove", expectedRevision: 1, clipId: clip.id }, { committedAtIso: "2026-09-12T09:01:00.000Z" });
    expect(removed.nextDoc.clips[clip.id]).toBeUndefined();
    expect(applyTransactionInverse(removed.nextDoc, removed.transaction)).toEqual(added.nextDoc);
  });

  it("rejects stale, unknown, invalid, and invariant-breaking commands atomically", () => {
    const base = populatedProject();
    const before = JSON.stringify(base);
    const commands = [
      { type: "project/rename", expectedRevision: 99, title: "Stale" },
      { type: "project/rename", expectedRevision: 0, title: "   " },
      { type: "clip/setTiming", expectedRevision: 0, clipId: "clip-b", startUs: timeUs(1), durationUs: timeUs(2_000_000) },
      { type: "not-real", expectedRevision: 0 },
    ];
    for (const command of commands) {
      expect(() => executeCommand(base, command as never, { committedAtIso })).toThrow(ProjectModelError);
      expect(JSON.stringify(base)).toBe(before);
    }
  });

  it("registers, renames, replaces, and removes asset metadata reversibly", () => {
    const base = emptyProject();
    const asset = { id: "asset-new", name: "Portrait.jpg", kind: "image" as const, mimeType: "image/jpeg", byteSize: 1234, width: 800, height: 1200, fingerprint: "sha-new" };
    const registered = executeCommand(base, { type: "asset/register", expectedRevision: 0, asset }, { committedAtIso });
    expect(registered.nextDoc.assetOrder).toEqual([asset.id]);
    expect(JSON.stringify(registered.nextDoc)).not.toMatch(/Blob|objectURL|FileSystem/);
    expect(applyTransactionInverse(registered.nextDoc, registered.transaction)).toEqual(base);
    const renamed = executeCommand(registered.nextDoc, { type: "asset/rename", expectedRevision: 1, assetId: asset.id, name: "Cover" }, { committedAtIso: "2026-09-12T09:01:00.000Z" });
    expect(renamed.nextDoc.assets[asset.id]?.name).toBe("Cover");
    const replaced = executeCommand(renamed.nextDoc, { type: "asset/replaceMetadata", expectedRevision: 2, assetId: asset.id, metadata: { name: "Replacement", kind: "image", mimeType: "image/jpeg", byteSize: 1234, width: 800, height: 1200, fingerprint: "sha-replacement" } }, { committedAtIso: "2026-09-12T09:02:00.000Z" });
    expect(replaced.nextDoc.assets[asset.id]?.fingerprint).toBe("sha-replacement");
    const removed = executeCommand(replaced.nextDoc, { type: "asset/remove", expectedRevision: 3, assetId: asset.id }, { committedAtIso: "2026-09-12T09:03:00.000Z" });
    expect(removed.nextDoc.assets[asset.id]).toBeUndefined();
    expect(applyTransactionInverse(removed.nextDoc, removed.transaction)).toEqual(replaced.nextDoc);
  });

  it("rejects duplicate assets and removal of referenced media atomically", () => {
    const base = populatedProject(); const before = structuredClone(base);
    expect(() => executeCommand(base, { type: "asset/register", expectedRevision: 0, asset: { ...base.assets["asset-video"]!, id: "asset-duplicate" } }, { committedAtIso })).toThrow(ProjectModelError);
    expect(() => executeCommand(base, { type: "asset/remove", expectedRevision: 0, assetId: "asset-video" }, { committedAtIso })).toThrow(ProjectModelError);
    expect(base).toEqual(before);
  });
});
