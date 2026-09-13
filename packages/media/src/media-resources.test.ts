import { describe, expect, it, vi } from "vitest";
import { File } from "node:buffer";
import { InMemoryBinaryStore } from "./binary-store";
import { MediaResourceManager } from "./media-resources";

describe("MediaResourceManager",()=>{it("shares URLs and returns stress cycles to baseline",async()=>{const store=new InMemoryBinaryStore();await store.writePartial("aurelius/imports/x.partial",new File([new Uint8Array([1])],"x"));await store.promote("aurelius/imports/x.partial","aurelius/assets/a/original",1);let next=0;const revoked:string[]=[];const manager=new MediaResourceManager(store,()=>`blob:${++next}`,(url)=>revoked.push(url),{set:(_d,cb)=>{cb();return 1},clear:vi.fn()},0);const first=await manager.acquire("a","1","aurelius/assets/a/original");const second=await manager.acquire("a","1","aurelius/assets/a/original");expect(first.url).toBe(second.url);first.release();second.release();expect(manager.diagnostics()).toEqual({entries:0,urls:0,leases:0});expect(revoked).toHaveLength(1);for(let i=0;i<200;i++){const lease=await manager.acquire("a",String(i+2),"aurelius/assets/a/original");lease.release();}expect(manager.diagnostics().urls).toBe(0);});});
