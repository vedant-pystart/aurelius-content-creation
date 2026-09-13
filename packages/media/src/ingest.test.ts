import { File } from "node:buffer";
import { describe, expect, it } from "vitest";
import { InMemoryBinaryStore } from "./binary-store";
import { MediaIngestService } from "./ingest";
import { DexieMediaRepository } from "./media-repository";
import { testDatabase, destroyDatabase } from "./test/indexeddb";
import type { MediaInspector, StoragePolicy, ThumbnailGenerator } from "./types";

const policy:StoragePolicy={inspect:async()=>({ok:true,value:{usage:0,quota:1e9,available:1e9,headroom:1,mode:"persistent"}}),assertCanImport:async()=>({ok:true,value:{usage:0,quota:1e9,available:1e9,headroom:1,mode:"persistent"}}),requestPersistence:async()=>({ok:true,value:{usage:0,quota:1e9,available:1e9,headroom:1,mode:"persistent"}})};
const inspector:MediaInspector={inspect:async(input)=>({ok:true,value:{kind:"video",container:"mp4",mimeType:"video/mp4",codecs:["h264"],byteSize:input.size,durationUs:1_000_000,displayWidth:640,displayHeight:360,support:"ready"}})};
const thumbnails:ThumbnailGenerator={create:async()=>({ok:true,value:null})};
describe("MediaIngestService",()=>{
 it("stages ready media and deduplicates identical input",async()=>{const db=testDatabase("ingest");const repo=new DexieMediaRepository(db);const store=new InMemoryBinaryStore();let id=0;const service=new MediaIngestService(policy,store,inspector,thumbnails,repo,()=>"2026-09-12T00:00:00.000Z",()=>String(++id));const file=new File([new Uint8Array([1,2,3,4])],"clip.mp4",{type:"video/mp4",lastModified:1});const one=await service.importOne("p",file);const two=await service.importOne("p",file);expect(one.ok&&one.value.reused).toBe(false);expect(two.ok&&two.value.reused).toBe(true);expect([...store.files.keys()].filter(p=>p.endsWith("/original"))).toHaveLength(1);expect(await repo.listPending()).toEqual([]);await destroyDatabase(db);});
 it("rolls back failed inspection",async()=>{const db=testDatabase("ingest-fail");const repo=new DexieMediaRepository(db);const store=new InMemoryBinaryStore();const bad:MediaInspector={inspect:async()=>({ok:false,error:new (await import("./errors")).MediaError("CORRUPT_INPUT","bad","choose-another-file")})};const service=new MediaIngestService(policy,store,bad,thumbnails,repo);const result=await service.importOne("p",new File([new Uint8Array([1])],"bad"));expect(result.ok).toBe(false);expect(store.files.size).toBe(0);expect(await db.assets.count()).toBe(0);await destroyDatabase(db);});
});
