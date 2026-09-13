import { describe, expect, it } from "vitest";
import { DexieMediaRepository } from "./media-repository";
import { testDatabase, destroyDatabase } from "./test/indexeddb";
import type { StoredMediaAsset } from "./types";

const asset = (id="a",fingerprint="hash"):StoredMediaAsset=>({id,fingerprint,displayName:"Source",kind:"video",container:"mp4",mimeType:"video/mp4",codecs:["h264"],byteSize:10,durationUs:1_000_000,displayWidth:640,displayHeight:360,support:"ready",sourcePath:`aurelius/assets/${id}/original`,state:"ready",createdAt:"2026-09-12T00:00:00.000Z",updatedAt:"2026-09-12T00:00:00.000Z"});
describe("DexieMediaRepository",()=>{
 it("deduplicates fingerprints and preserves stable IDs",async()=>{const db=testDatabase("media");const repo=new DexieMediaRepository(db);await repo.register(asset(),"p");expect(await repo.findByFingerprint("hash")).toMatchObject({id:"a"});await expect(repo.register(asset("b","hash"),"p")).rejects.toBeTruthy();const replaced=await repo.replace("a",{...asset("a","new"),displayName:"Replacement"});expect(replaced.id).toBe("a");expect((await repo.listForProject("p"))[0]?.fingerprint).toBe("new");await destroyDatabase(db);});
});
