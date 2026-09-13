import { createProjectDoc } from "@aurelius/project-model";
import { describe, expect, it } from "vitest";
import { DexieProjectRepository } from "./project-repository";
import { testDatabase, destroyDatabase } from "./test/indexeddb";

const make = (id: string, now = "2026-09-12T00:00:00.000Z") => createProjectDoc({ id, title: id, width: 1080, height: 1920, frameRate: { numerator: 30, denominator: 1 }, nowIso: now, createId: (() => { let n=0; return () => `${id}-${++n}`; })() });
describe("DexieProjectRepository", () => {
  it("keeps five projects isolated across close and reopen", async () => {
    const db = testDatabase("projects"); const repo = new DexieProjectRepository(db);
    for (let i=0;i<5;i++) await repo.create(make(`project-${i}`, `2026-09-12T00:00:0${i}.000Z`));
    db.close(); await db.open(); expect(await repo.list()).toHaveLength(5); expect((await repo.get("project-3"))?.title).toBe("project-3");
    const source = (await repo.get("project-3"))!; const next = { ...source, revision: 1, title: "Saved", updatedAt: "2026-09-12T01:00:00.000Z" };
    await repo.save(next, 0); await expect(repo.save({ ...next, revision: 2 }, 0)).rejects.toMatchObject({ code: "STALE_PROJECT" });
    expect((await repo.get("project-3"))?.revision).toBe(1); expect((await repo.getRecovery("project-3"))?.revision).toBe(0);
    await repo.delete("project-2"); expect(await repo.list()).toHaveLength(4); await destroyDatabase(db);
  });
});
