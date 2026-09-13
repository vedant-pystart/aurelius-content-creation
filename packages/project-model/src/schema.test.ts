import { describe, expect, it } from "vitest";
import { createProjectDoc } from "./factory";
import { ProjectDocSchema } from "./schema";

describe("ProjectDoc schema", () => {
  for (const height of [1920, 1350, 1080] as const) {
    for (const fps of [24, 30, 60] as const) {
      it(`creates and round-trips ${height} at ${fps}fps`, () => {
        let id = 0;
        const project = createProjectDoc({ width: 1080, height, frameRate: { numerator: fps, denominator: 1 }, nowIso: "2026-09-12T00:00:00.000Z", createId: () => String(++id) });
        expect(ProjectDocSchema.parse(JSON.parse(JSON.stringify(project)))).toEqual(project);
      });
    }
  }

  it("rejects unknown and runtime-only values", () => {
    const project = createProjectDoc({ width: 1080, height: 1920, frameRate: { numerator: 30, denominator: 1 } });
    expect(ProjectDocSchema.safeParse({ ...project, unexpected: true }).success).toBe(false);
    expect(ProjectDocSchema.safeParse({ ...project, createdAt: new Date() }).success).toBe(false);
    expect(ProjectDocSchema.safeParse({ ...project, revision: 0.5 }).success).toBe(false);
  });
});
