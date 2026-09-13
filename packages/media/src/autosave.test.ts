import { createProjectDoc, executeCommand, InMemoryProjectRepository } from "@aurelius/project-model";
import { describe, expect, it } from "vitest";
import { AutosaveCoordinator } from "./autosave";

describe("AutosaveCoordinator", () => {
  it("serializes monotonic revisions and ignores duplicates", async () => {
    const repo = new InMemoryProjectRepository(); const base = createProjectDoc({ id:"p", title:"P", width:1080, height:1920, frameRate:{numerator:30,denominator:1}, nowIso:"2026-09-12T00:00:00.000Z", createId:(()=>{let i=0;return()=>String(++i)})() }); await repo.create(base);
    const one = executeCommand(base,{type:"project/rename",expectedRevision:0,title:"One"},{committedAtIso:"2026-09-12T00:01:00.000Z"}).nextDoc;
    const two = executeCommand(one,{type:"project/rename",expectedRevision:1,title:"Two"},{committedAtIso:"2026-09-12T00:02:00.000Z"}).nextDoc;
    const autosave = new AutosaveCoordinator(repo,"p",0); autosave.submit(one); autosave.submit(one); autosave.submit(two); await autosave.flush();
    expect(await repo.get("p")).toMatchObject({revision:2,title:"Two"}); expect(autosave.snapshot.status).toBe("saved"); await autosave.dispose();
  });
  it("enters recovery on a revision gap", async () => { const repo = new InMemoryProjectRepository(); const autosave = new AutosaveCoordinator(repo,"p",0); autosave.submit({id:"p",revision:2} as never); expect(autosave.snapshot.status).toBe("recovery"); });
  it("adopts an atomically persisted media revision without replaying it", async () => {
    const repo = new InMemoryProjectRepository(); const base = createProjectDoc({ id:"p", title:"P", width:1080, height:1920, frameRate:{numerator:30,denominator:1}, nowIso:"2026-09-12T00:00:00.000Z", createId:(()=>{let i=0;return()=>String(++i)})() }); await repo.create(base);
    const relinked = executeCommand(base,{type:"project/rename",expectedRevision:0,title:"Relinked"},{committedAtIso:"2026-09-12T00:01:00.000Z"}).nextDoc;
    await repo.save(relinked,0);
    const autosave = new AutosaveCoordinator(repo,"p",0); autosave.adoptPersisted(relinked);
    const next = executeCommand(relinked,{type:"project/rename",expectedRevision:1,title:"After relink"},{committedAtIso:"2026-09-12T00:02:00.000Z"}).nextDoc;
    autosave.submit(next); await autosave.flush();
    expect(await repo.get("p")).toMatchObject({revision:2,title:"After relink"}); expect(autosave.snapshot.status).toBe("saved"); await autosave.dispose();
  });
});
