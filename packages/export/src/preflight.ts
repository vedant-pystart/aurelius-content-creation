import type { ExportPreflightAdapter, ExportPreflightCheck, ExportPreflightReport, RenderSnapshot } from "./contracts";
const check = (id: ExportPreflightCheck["id"], status: ExportPreflightCheck["status"], label: string, detail: string, recovery: ExportPreflightCheck["recovery"], diagnostic?: string): ExportPreflightCheck => diagnostic === undefined ? { id, status, label, detail, recovery } : { id, status, label, detail, recovery, diagnostic };

export async function runExportPreflight(snapshot: RenderSnapshot, adapter: ExportPreflightAdapter): Promise<ExportPreflightReport> {
  const assetResults = await Promise.all(snapshot.assets.map((asset) => adapter.asset(asset.id)));
  const badAsset = assetResults.find((result, index) => result.state !== "ready" || result.fingerprint !== snapshot.assets[index]!.fingerprint);
  const badDecode = assetResults.find((result) => result.sourceDecode !== "ready");
  const [codec, fonts, storage, budget] = await Promise.all([adapter.codec({ width: snapshot.dimensions.width, height: snapshot.dimensions.height, fps: snapshot.frameRate, audio: snapshot.expectedAudio }), adapter.fonts(), adapter.storage(), adapter.budget(snapshot)]);
  const checks: ExportPreflightCheck[] = [
    check("asset", badAsset ? "blocker" : "pass", "Referenced media", badAsset ? "Relink the missing or changed source media." : "Every referenced source matches the frozen project.", "relink-media"),
    check("decode", badDecode ? "blocker" : "pass", "Source decoding", badDecode ? "A selected source cannot be decoded by this browser." : "Selected source tracks are decodable.", "server-fallback"),
    check("video-encoder", codec.h264.supported ? "pass" : "blocker", "H.264 video", codec.h264.supported ? "H.264 is available for this exact export." : "This browser cannot encode the requested H.264 video.", "server-fallback", codec.h264.diagnostic),
    check("audio-encoder", !snapshot.expectedAudio || codec.aac.supported ? "pass" : "blocker", "AAC audio", !snapshot.expectedAudio ? "This is an intentional silent MP4." : codec.aac.supported ? "AAC is available for this export." : "This browser cannot encode AAC audio.", "server-fallback", codec.aac.diagnostic),
    check("mp4-muxer", codec.mp4.supported ? "pass" : "blocker", "MP4 muxer", codec.mp4.supported ? "MP4 container creation is available." : "This browser cannot mux this export as MP4.", "server-fallback", codec.mp4.diagnostic),
    check("output-target", codec.output.supported ? "pass" : "blocker", "Local output", codec.output.supported ? "A streaming local output target is ready." : "A safe local output stream is unavailable.", "server-fallback", codec.output.diagnostic),
    check("fonts", fonts.supported ? "pass" : "blocker", "Aurelius fonts", fonts.supported ? "Bundled Aurelius fonts are ready." : "Wait for the bundled fonts, then retry.", "retry-fonts", fonts.diagnostic),
    check("storage", storage.writable && storage.availableBytes > 0 ? "pass" : "blocker", "Local storage", storage.writable && storage.availableBytes > 0 ? `${Math.floor(storage.availableBytes / 1024 / 1024)} MB is available for this export.` : "Free local storage or choose a server export.", "free-storage", storage.diagnostic),
    check("budget", budget.withinBudget ? "pass" : "blocker", "Local browser budget", budget.withinBudget ? "This render fits the conservative local budget." : "Reduce the range or use the explicit server fallback.", "reduce-range", budget.diagnostic),
  ];
  const blocked = checks.some((item) => item.status === "blocker");
  const serverFallbackEligible = checks.some((item) => item.status === "blocker" && item.recovery === "server-fallback");
  return Object.freeze({ snapshotJobId: snapshot.jobId, checks: Object.freeze(checks), canRenderLocally: !blocked, serverFallbackEligible });
}
