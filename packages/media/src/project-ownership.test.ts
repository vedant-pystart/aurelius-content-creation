import { describe, expect, it } from "vitest";
import { ProjectOwnership } from "./project-ownership";

describe("ProjectOwnership", () => {
  it("reports reduced protection without Web Locks", async () => { const ownership = new ProjectOwnership(undefined, undefined, "tab-a"); expect(await ownership.acquire("p")).toEqual({mode:"unprotected",writable:true,reducedProtection:true}); await ownership.dispose(); });
  it("reports read-only when a nonblocking lock is unavailable", async () => { const locks = { request: async (_n:string,_o:unknown,cb:(lock:null)=>Promise<void>) => cb(null) }; const ownership = new ProjectOwnership(locks as never, undefined, "tab-b"); expect((await ownership.acquire("p")).mode).toBe("read-only"); await ownership.dispose(); });
  it("uses an ifAvailable lock request that Chromium accepts", async () => {
    let options: unknown;
    const locks = { request: (_name: string, received: unknown, callback: (lock: object) => Promise<void>) => { options = received; void callback({}); return Promise.resolve(); } };
    const ownership = new ProjectOwnership(locks as never, undefined, "tab-c");
    await expect(ownership.acquire("p")).resolves.toEqual({ mode: "owner", writable: true, reducedProtection: false });
    expect(options).toEqual({ mode: "exclusive", ifAvailable: true });
    await ownership.dispose();
  });
  it("settles as read-only if a lock request is rejected", async () => {
    const locks = { request: () => Promise.reject(new DOMException("unsupported", "NotSupportedError")) };
    const ownership = new ProjectOwnership(locks as never, undefined, "tab-d");
    await expect(ownership.acquire("p")).resolves.toEqual({ mode: "read-only", writable: false, reducedProtection: false });
    await ownership.dispose();
  });
  it("ignores a stale lock callback after a release", async () => {
    let callback: ((lock: object) => Promise<void>) | undefined;
    const locks = { request: (_name: string, _options: unknown, received: (lock: object) => Promise<void>) => { callback = received; return Promise.resolve(); } };
    const ownership = new ProjectOwnership(locks as never, undefined, "tab-e");
    void ownership.acquire("p");
    await Promise.resolve();
    expect(callback).toBeDefined();
    await ownership.release();
    await callback!({});
    expect(ownership.snapshot).toEqual({ mode: "read-only", writable: false, reducedProtection: false });
  });
});
