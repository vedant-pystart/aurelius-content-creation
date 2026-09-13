import { describe, expect, it } from "vitest";
import { exportManifest, parseManifest } from "./manifest";
import { DexieProjectRepository } from "./project-repository";
import { ProjectService } from "./project-service";
import { destroyDatabase, testDatabase } from "./test/indexeddb";

describe("Phase 2 local-project acceptance", () => {
  it("keeps five isolated projects durable across a reopen and exports only relinkable creative state", async () => {
    const db = testDatabase("phase-02-acceptance");
    const repository = new DexieProjectRepository(db);
    let id = 0;
    const service = new ProjectService(repository, () => "2026-09-12T00:00:00.000Z", () => `acceptance-${++id}`);

    const created = await Promise.all(["First", "Second", "Third", "Fourth", "Fifth"].map((title) => service.create({ title })));
    const renamed = await service.rename(created[0]!.id, "First renamed");
    const duplicate = await service.duplicate(created[1]!.id);
    await service.delete(created[2]!.id);

    expect(await service.list()).toHaveLength(5);
    expect((await service.open(renamed.id))?.title).toBe("First renamed");
    expect(duplicate.id).not.toBe(created[1]!.id);

    db.close();
    await db.open();
    expect(await repository.list()).toHaveLength(5);
    expect((await repository.get(renamed.id))?.revision).toBe(1);

    const backup = exportManifest(renamed, "2026-09-12T00:05:00.000Z");
    const restored = parseManifest(backup.content);
    expect(restored).toMatchObject({ ok: true });
    expect(backup.content).not.toMatch(/Blob|File|sourcePath|objectURL|base64/i);
    expect(JSON.parse(backup.content).assets).toEqual([]);

    await destroyDatabase(db);
  });
});
