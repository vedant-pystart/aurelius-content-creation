import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import v1 from "./__fixtures__/project-v1.json" with { type: "json" };
import v2 from "./__fixtures__/project-v2.json" with { type: "json" };
import {
  InMemoryProjectRepository, ProjectModelError, applyTransactionForward,
  applyTransactionInverse, createProjectDoc, deriveProjectDurationUs, executeCommand,
  frameIndex, frameIndexToTimeUs, loadProjectDoc, timeUsToFrameIndex,
  validateCurrentProjectDoc,
  type CommandTransaction, type ProjectDoc,
} from "@aurelius/project-model";

function project(height: 1920 | 1350 | 1080, fps: 24 | 30 | 60): ProjectDoc {
  let id = 0;
  return createProjectDoc({
    id: `acceptance-${height}-${fps}`, title: "Acceptance Film", width: 1080, height,
    frameRate: { numerator: fps, denominator: 1 }, nowIso: "2026-09-12T12:00:00.000Z",
    createId: () => String(++id),
  });
}

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

describe("Phase 1 acceptance", () => {
  it("keeps every format and frame rate exact through JSON and repeated conversions", () => {
    for (const height of [1920, 1350, 1080] as const) {
      for (const fps of [24, 30, 60] as const) {
        const created = project(height, fps);
        const loaded = loadProjectDoc(JSON.parse(JSON.stringify(created)));
        expect(loaded.ok).toBe(true);
        if (!loaded.ok) continue;
        expect(loaded.value).toEqual(created);
        for (const raw of [0, 1, fps * 60, fps * 3600, 10_000_000]) {
          const initial = frameIndex(raw);
          let current = initial;
          for (let cycle = 0; cycle < 100; cycle += 1) {
            current = timeUsToFrameIndex(frameIndexToTimeUs(current, created.composition.frameRate), created.composition.frameRate, "nearest");
          }
          expect(current).toBe(initial);
        }
      }
    }
  });

  it("rejects malformed graphs before repository ingress", async () => {
    const repository = new InMemoryProjectRepository();
    const valid = project(1920, 30);
    const invalids: unknown[] = [
      { ...valid, revision: -1 },
      { ...valid, trackOrder: [...valid.trackOrder, "missing"] },
      { ...valid, schemaVersion: 99 },
      { ...valid, composition: { ...valid.composition, width: 720 } },
      { ...valid, unknown: true },
    ];
    for (const invalid of invalids) {
      expect(validateCurrentProjectDoc(invalid).ok).toBe(false);
      await expect(repository.create(invalid as ProjectDoc)).rejects.toBeInstanceOf(ProjectModelError);
    }
    expect(await repository.list()).toEqual([]);
  });

  it("migrates history without changing creative observables and rejects the future", () => {
    const migrated = loadProjectDoc(v1);
    expect(migrated.ok).toBe(true);
    if (!migrated.ok) return;
    expect(migrated.value.schemaVersion).toBe(3);
    expect(deriveProjectDurationUs(migrated.value)).toBe(4_500_000);
    expect(migrated.value.trackOrder).toEqual(expect.arrayContaining(v2.trackOrder));
    expect(Object.values(migrated.value.clips).filter((clip: any) => clip.kind !== "audio").map(({ startUs, durationUs }) => [startUs, durationUs]))
      .toEqual(Object.values(v2.clips).map(({ startUs, durationUs }) => [startUs, durationUs]));
    const future = loadProjectDoc({ ...v2, schemaVersion: 4 });
    expect(future.ok).toBe(false);
    if (!future.ok) expect(future.error).toMatchObject({ code: "PROJECT_VERSION_TOO_NEW", recoveryAction: "update-app" });
  });

  it("round-trips a mixed command history exactly", () => {
    const initial = project(1080, 60);
    let current = initial;
    const transactions: CommandTransaction[] = [];
    for (const [index, command] of [
      { type: "project/rename" as const, title: "Aurelius Cut" },
      { type: "composition/setBackground" as const, color: "#2A2522" },
      { type: "project/rename" as const, title: "Aurelius Cut II" },
    ].entries()) {
      const result = executeCommand(current, { ...command, expectedRevision: current.revision }, { committedAtIso: `2026-09-12T12:00:0${index}.000Z` });
      current = result.nextDoc;
      transactions.push(result.transaction);
      expect(validateCurrentProjectDoc(current).ok).toBe(true);
    }
    const final = current;
    for (let index = transactions.length - 1; index >= 0; index -= 1) current = applyTransactionInverse(current, transactions[index]!);
    expect(current).toEqual(initial);
    for (const transaction of transactions) current = applyTransactionForward(current, transaction);
    expect(current).toEqual(final);
  });

  it("keeps generated public command sequences valid and reversible", () => {
    fc.assert(fc.property(
      fc.constantFrom(24 as const, 30 as const, 60 as const),
      fc.array(fc.tuple(fc.boolean(), fc.integer({ min: 0, max: 0xffffff })), { minLength: 1, maxLength: 30 }),
      (fps, operations) => {
        const initial = project(1350, fps);
        let current = initial;
        const transactions: CommandTransaction[] = [];
        for (const [rename, value] of operations) {
          const command = rename
            ? { type: "project/rename" as const, expectedRevision: current.revision, title: `Film ${value}` }
            : { type: "composition/setBackground" as const, expectedRevision: current.revision, color: `#${value.toString(16).padStart(6, "0")}` };
          const result = executeCommand(current, command, { committedAtIso: "2026-09-12T12:30:00.000Z" });
          current = result.nextDoc;
          transactions.push(result.transaction);
          expect(validateCurrentProjectDoc(current).ok).toBe(true);
        }
        const final = current;
        for (let index = transactions.length - 1; index >= 0; index -= 1) current = applyTransactionInverse(current, transactions[index]!);
        expect(current).toEqual(initial);
        for (const transaction of transactions) current = applyTransactionForward(current, transaction);
        expect(current).toEqual(final);
      },
    ), { seed: 20_260_912, numRuns: 100 });
  });

  it("keeps production domain sources free of browser, storage, media, and React APIs", () => {
    const root = dirname(fileURLToPath(import.meta.url));
    const productionFiles = walk(root).filter((path) => path.endsWith(".ts") && !path.endsWith(".test.ts") && !path.includes("__fixtures__"));
    const forbidden = [
      /from\s+["']react(?:\/|["'])/i, /\bdocument\b/i, /\bwindow\b/i, /\bIndexedDB\b/i,
      /\bOPFS\b/i, /\bWebCodecs\b/i, /\bRemotion\b/i, /\blocalStorage\b/i,
      /\bHTMLVideoElement\b/i, /\bAudioContext\b/i, /\bCanvasRenderingContext/i,
    ];
    for (const path of productionFiles) {
      const source = readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      for (const pattern of forbidden) expect(source, `${path} contains ${pattern}`).not.toMatch(pattern);
    }
  });
});
