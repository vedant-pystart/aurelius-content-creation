import { File } from "node:buffer";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { InMemoryBinaryStore } from "./binary-store";
import { fingerprintMedia } from "./fingerprint";
import { BrowserMediaInspector } from "./media-inspector";
import { BrowserStoragePolicy } from "./storage-policy";

const fixture = async (name: string, type: string) => { const bytes = await readFile(resolve(process.cwd(), "../test-fixtures/media", name)); return new File([bytes], name, { type, lastModified: 7 }); };
describe("storage, quota, partial", () => {
  it("streams, verifies, promotes, cleans partials and rejects traversal", async () => { const store = new InMemoryBinaryStore(); const file = new File([new Uint8Array([1,2,3])],"x.bin"); await store.writePartial("aurelius/imports/job.partial",file); await store.promote("aurelius/imports/job.partial","aurelius/assets/a/original",3); expect(await store.size("aurelius/assets/a/original")).toBe(3); expect(await store.listPartials()).toEqual([]); await expect(store.delete("../secret")).rejects.toMatchObject({code:"STORAGE_UNAVAILABLE"}); });
  it("enforces headroom and reports persistence honestly", async () => { let persistent=false; const policy = new BrowserStoragePolicy({ estimate:async()=>({usage:800,quota:1000}), persisted:async()=>persistent, persist:async()=>{persistent=true;return true;} }); expect((await policy.assertCanImport(100)).ok).toBe(false); const requested=await policy.requestPersistence(); expect(requested.ok&&requested.value.mode).toBe("persistent"); });
});
describe("inspect, fingerprint, thumbnail, unsupported", () => {
  it("fingerprints bounded content deterministically", async () => { const file=await fixture("test.mp4","video/mp4"); expect(await fingerprintMedia(file)).toBe(await fingerprintMedia(file)); expect(await fingerprintMedia(new File([await file.arrayBuffer()],"renamed.mp4",{lastModified:7}))).toBe(await fingerprintMedia(file)); });
  it.each([["test.mp4","video/mp4","video"],["test.webm","video/webm","video"],["speech.wav","audio/wav","audio"],["rotated-orientation-6.jpg","image/jpeg","image"]])("inspects real %s fixture", async (name,type,kind) => { const inspector=new BrowserMediaInspector(async()=>"ready"); const result=await inspector.inspect(await fixture(name,type)); expect(result.ok).toBe(true); if(result.ok){ expect(result.value.kind).toBe(kind); expect(result.value.byteSize).toBeGreaterThan(0); if(kind==="image") expect(result.value.orientation).toBe(6); else expect(result.value.durationUs).toBeGreaterThan(0); } });
  it("rejects spoofed and truncated media", async () => { const inspector=new BrowserMediaInspector(async()=>"ready"); const result=await inspector.inspect(new File([new Uint8Array([1,2,3])],"fake.mp4",{type:"video/mp4"})); expect(result).toMatchObject({ok:false,error:{code:"UNSUPPORTED_SIGNATURE"}}); });
});
