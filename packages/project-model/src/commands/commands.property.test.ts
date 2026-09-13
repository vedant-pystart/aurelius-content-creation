import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { emptyProject } from "../__fixtures__/projects";
import type { ProjectDoc, TextClip } from "../model";
import { timeUs } from "../time";
import { validateCurrentProjectDoc } from "../validation";
import type { CommandTransaction, EditorCommand } from "./contracts";
import { applyTransactionForward, applyTransactionInverse, executeCommand } from "./execute";

type Action = Readonly<{ kind: "rename" | "background" | "add" | "remove" | "timing"; value: number }>;
const actionArb = fc.record({ kind: fc.constantFrom("rename", "background", "add", "remove", "timing"), value: fc.integer({ min: 0, max: 50 }) });

function textClip(doc: ProjectDoc, id: string, value: number): TextClip {
  const trackId = doc.trackOrder.find((candidate) => doc.tracks[candidate]?.kind === "text")!;
  const duration = timeUs(500_000 + value * 10_000);
  return {
    id, trackId, kind: "text", startUs: timeUs(value * 20_000), durationUs: duration, layer: value, enabled: true,
    content: `Thought ${value}`, textStyleId: doc.textStyleOrder[0]!,
    transform: { x: 540, y: 960, scaleX: 1, scaleY: 1, rotationDeg: 0, opacity: 1 },
    motion: { treatment: "none", entranceUs: timeUs(0), holdUs: duration, exitUs: timeUs(0), staggerUs: timeUs(0) },
  };
}

describe("mixed command properties", () => {
  it("preserves invariants and exact inverse/forward history", () => {
    fc.assert(fc.property(
      fc.constantFrom(24 as const, 30 as const, 60 as const),
      fc.array(actionArb, { minLength: 1, maxLength: 60 }),
      (fps, actions) => {
        const initial = emptyProject(1920, fps);
        let current = initial;
        const transactions: CommandTransaction[] = [];
        const liveClipIds: string[] = [];
        let serial = 0;
        for (const action of actions) {
          let command: EditorCommand;
          switch (action.kind) {
            case "rename": command = { type: "project/rename", expectedRevision: current.revision, title: `Film ${action.value}` }; break;
            case "background": command = { type: "composition/setBackground", expectedRevision: current.revision, color: `#${action.value.toString(16).padStart(6, "0")}` }; break;
            case "add": {
              const id = `generated-${serial++}`;
              liveClipIds.push(id);
              command = { type: "clip/add", expectedRevision: current.revision, clip: textClip(current, id, action.value) };
              break;
            }
            case "remove": {
              if (liveClipIds.length === 0) command = { type: "project/rename", expectedRevision: current.revision, title: `Empty ${action.value}` };
              else {
                const index = action.value % liveClipIds.length;
                const clipId = liveClipIds[index]!;
                liveClipIds.splice(index, 1);
                command = { type: "clip/remove", expectedRevision: current.revision, clipId };
              }
              break;
            }
            case "timing": {
              if (liveClipIds.length === 0) command = { type: "composition/setBackground", expectedRevision: current.revision, color: "#FBF3E6" };
              else {
                const clipId = liveClipIds[action.value % liveClipIds.length]!;
                const clip = current.clips[clipId]!;
                command = { type: "clip/setTiming", expectedRevision: current.revision, clipId, startUs: timeUs(action.value * 30_000), durationUs: clip.durationUs };
              }
              break;
            }
          }
          const result = executeCommand(current, command, { committedAtIso: new Date(Date.UTC(2026, 8, 12, 10, 0, current.revision)).toISOString() });
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
    ), { seed: 20_260_912, numRuns: 120 });
  });

  it("rejected commands never mutate the document", () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 1000 }), (offset) => {
      const project = emptyProject();
      const before = JSON.stringify(project);
      expect(() => executeCommand(project, { type: "clip/remove", expectedRevision: project.revision + offset, clipId: "missing" }, { committedAtIso: "2026-09-12T10:00:00.000Z" })).toThrow();
      expect(JSON.stringify(project)).toBe(before);
    }), { seed: 20_260_912, numRuns: 100 });
  });
});
