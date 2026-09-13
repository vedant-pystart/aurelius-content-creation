import { describe, expect, it } from "vitest";
import { InMemoryProjectRepository } from "@aurelius/project-model";
import { ProjectService } from "./project-service";

describe("ProjectService", () => {
  it("creates, renames, duplicates, lists, opens and deletes isolated projects", async () => {
    let id=0; let minute=0; const repo = new InMemoryProjectRepository(); const service = new ProjectService(repo, () => `2026-09-12T00:${String(minute++).padStart(2,"0")}:00.000Z`, () => String(++id));
    const created = await service.create({ title: "First" }); await service.create({ title: "Second", height: 1350 });
    const renamed = await service.rename(created.id, "First Cut"); expect(renamed.revision).toBe(1);
    const copy = await service.duplicate(created.id); expect(copy.id).not.toBe(created.id); expect(copy.revision).toBe(0); expect(copy.trackOrder).toEqual(created.trackOrder);
    expect(await service.list()).toHaveLength(3); const deletion = await service.delete(created.id); expect(deletion.unreferencedAssetIds).toEqual([]); expect(await service.open(created.id)).toBeNull();
  });
});
