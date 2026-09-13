import { bundledFontStatus } from "@aurelius/composition";
import { canRenderMediaOnWeb } from "@remotion/web-renderer";
import type { ExportPreflightAdapter, RenderSnapshot } from "./contracts";

export interface BrowserAssetLookup { get(id: string): Promise<{ readonly state: "ready" | "missing"; readonly fingerprint: string; readonly decode: "ready" | "unsupported" } | null> }
const capability = (supported: boolean, diagnostic?: string) => diagnostic === undefined ? { supported } : { supported, diagnostic };
export function createBrowserPreflightAdapter(assets: BrowserAssetLookup): ExportPreflightAdapter {
  return {
    async asset(id) { const asset = await assets.get(id); return asset ? { state: asset.state === "ready" ? "ready" : "missing", sourceDecode: asset.decode, fingerprint: asset.fingerprint } : { state: "missing", sourceDecode: "unsupported", fingerprint: "" }; },
    async codec(input) { const result = await canRenderMediaOnWeb({ width: input.width, height: input.height, container: "mp4", videoCodec: "h264", audioCodec: input.audio ? "aac" : null, muted: !input.audio, outputTarget: "web-fs" }); const issue = (type: string) => result.issues.find((item) => item.type === type)?.message; return { h264: capability(result.canRender && result.resolvedVideoCodec === "h264", issue("video-codec-unsupported")), aac: capability(!input.audio || result.resolvedAudioCodec === "aac", issue("audio-codec-unsupported")), mp4: capability(result.canRender, issue("container-codec-mismatch")), output: capability(result.resolvedOutputTarget === "web-fs", issue("output-target-unsupported")) }; },
    async fonts() { const ready = bundledFontStatus() === "ready"; return ready ? { supported: true } : { supported: false, diagnostic: "Bundled fonts are still loading." }; },
    async storage() { try { const estimate = await navigator.storage.estimate(); const availableBytes = Math.max(0, (estimate.quota ?? 0) - (estimate.usage ?? 0)); const root = await navigator.storage.getDirectory?.(); if (!root) return { writable: false, availableBytes, diagnostic: "OPFS storage is unavailable." }; const file = await root.getFileHandle(`aurelius-preflight-${crypto.randomUUID()}.tmp`, { create: true }); const writer = await file.createWritable(); await writer.write(new Uint8Array([0])); await writer.close(); await root.removeEntry(file.name); return { writable: true, availableBytes }; } catch { return { writable: false, availableBytes: 0, diagnostic: "The browser refused a disposable local output check." }; } },
    async budget(snapshot: RenderSnapshot) { const pixels = snapshot.frameCount * snapshot.dimensions.width * snapshot.dimensions.height; const withinBudget = snapshot.frameCount <= 18_000 && pixels <= 20_000_000_000 && snapshot.assets.length <= 30; return withinBudget ? { withinBudget: true } : { withinBudget: false, diagnostic: "The selected range exceeds the conservative local export budget." }; },
  };
}
