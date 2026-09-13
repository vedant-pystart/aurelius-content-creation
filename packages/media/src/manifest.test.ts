import { createProjectDoc, InMemoryProjectRepository } from "@aurelius/project-model";
import { describe, expect, it } from "vitest";
import { exportManifest, ManifestService, parseManifest } from "./manifest";
import { ProjectService } from "./project-service";

const project=()=>createProjectDoc({id:"manifest-project",title:"My Edit",width:1080,height:1920,frameRate:{numerator:30,denominator:1},nowIso:"2026-09-12T00:00:00.000Z",createId:(()=>{let i=0;return()=>String(++i)})()});
describe("project manifest",()=>{
 it("round trips deterministic JSON without media paths or bytes",()=>{const download=exportManifest(project(),"2026-09-12T01:00:00.000Z");expect(download.filename).toBe("My-Edit.aurelius-project");expect(download.content).not.toMatch(/sourcePath|Blob|base64|objectURL/);const parsed=parseManifest(download.content);expect(parsed.ok&&parsed.value.project).toEqual(project());});
 it("isolates ID collisions and rejects newer manifests",async()=>{const repo=new InMemoryProjectRepository();const service=new ProjectService(repo,()=>"2026-09-12T01:00:00.000Z",()=>"new-id");await repo.create(project());const manifests=new ManifestService(service,()=>"2026-09-12T01:00:00.000Z");const imported=await manifests.import(manifests.export(project()).content);expect(imported.ok&&imported.value.id).not.toBe(project().id);const newer=parseManifest(JSON.stringify({format:"aurelius-project",manifestVersion:99}));expect(newer).toMatchObject({ok:false,error:{code:"MANIFEST_NEWER"}});});
});
