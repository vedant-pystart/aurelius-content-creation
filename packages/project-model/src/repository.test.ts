import { describe, expect, it } from "vitest";
import { emptyProject } from "./__fixtures__/projects";
import { ProjectModelError } from "./errors";
import { InMemoryProjectRepository } from "./repository";
import { executeCommand } from "./commands/execute";

describe("InMemoryProjectRepository", () => {
  it("creates, lists, isolates, saves, and deletes projects", async () => {
    const repository = new InMemoryProjectRepository();
    const original = emptyProject();
    const created = await repository.create(original);
    expect(await repository.list()).toEqual([{ id: original.id, title: original.title, revision: 0, updatedAt: original.updatedAt }]);
    (created as any).title = "Caller mutation";
    expect((await repository.get(original.id))?.title).toBe(original.title);
    const renamed = executeCommand(original, { type: "project/rename", expectedRevision: 0, title: "Saved title" }, { committedAtIso: "2026-09-12T11:00:00.000Z" }).nextDoc;
    expect((await repository.save(renamed, 0)).title).toBe("Saved title");
    await repository.delete(original.id);
    expect(await repository.get(original.id)).toBeNull();
  });

  it("rejects duplicates, stale writes, missing projects, and invalid data atomically", async () => {
    const repository = new InMemoryProjectRepository();
    const original = emptyProject();
    await repository.create(original);
    await expect(repository.create(original)).rejects.toMatchObject({ code: "PROJECT_ALREADY_EXISTS" });
    const changed = executeCommand(original, { type: "project/rename", expectedRevision: 0, title: "Changed" }, { committedAtIso: "2026-09-12T11:00:00.000Z" }).nextDoc;
    await expect(repository.save(changed, 9)).rejects.toMatchObject({ code: "STALE_REVISION" });
    await expect(repository.save({ ...changed, id: "missing" }, 0)).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" });
    await expect(repository.save({ ...changed, revision: -1 } as never, 0)).rejects.toBeInstanceOf(ProjectModelError);
    expect(await repository.get(original.id)).toEqual(original);
  });
});
