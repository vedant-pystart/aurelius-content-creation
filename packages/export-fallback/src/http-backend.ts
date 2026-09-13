import type { BackendArtifact, ConsentReceipt, FallbackManifest, FallbackStatus, JobGrants, ServerExportBackend } from "./contracts";

type FetchLike = typeof fetch;
const jsonHeaders = { "Content-Type": "application/json", "Cache-Control": "no-store" };
export class HttpServerExportBackend implements ServerExportBackend {
  constructor(private readonly baseUrl: string, private readonly fetcher: FetchLike = fetch) { if (!/^https?:\/\//.test(baseUrl)) throw new Error("A configured HTTPS/HTTP render endpoint is required."); }
  private endpoint(path: string) { return `${this.baseUrl.replace(/\/$/, "")}${path}` }
  private async request(path: string, init: RequestInit, signal?: AbortSignal): Promise<Response> { const response = await this.fetcher(this.endpoint(path), { ...init, ...(signal ? { signal } : {}), cache: "no-store" }); if (!response.ok) throw new Error(`server-${response.status}`); return response; }
  async create(manifest: FallbackManifest, receipt: ConsentReceipt, signal?: AbortSignal): Promise<JobGrants> { const response = await this.request("/v1/exports", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ manifest, receipt }) }, signal); const value = await response.json() as JobGrants; if (!value.jobId || !value.job || !value.upload) throw new Error("Malformed server export response"); return value; }
  async upload(jobId: string, assetId: string, grant: string, source: Blob, signal?: AbortSignal): Promise<void> { await this.request(`/v1/exports/${encodeURIComponent(jobId)}/assets/${encodeURIComponent(assetId)}`, { method: "PUT", headers: { Authorization: `Bearer ${grant}`, "Content-Type": "application/octet-stream", "Cache-Control": "no-store" }, body: source }, signal); }
  async start(jobId: string, grant: string, signal?: AbortSignal): Promise<void> { await this.request(`/v1/exports/${encodeURIComponent(jobId)}/start`, { method: "POST", headers: { Authorization: `Bearer ${grant}`, "Cache-Control": "no-store" } }, signal); }
  async status(jobId: string, grant: string, signal?: AbortSignal): Promise<FallbackStatus> { const response = await this.request(`/v1/exports/${encodeURIComponent(jobId)}`, { headers: { Authorization: `Bearer ${grant}`, "Cache-Control": "no-store" } }, signal); return await response.json() as FallbackStatus; }
  async cancel(jobId: string, grant: string): Promise<void> { await this.request(`/v1/exports/${encodeURIComponent(jobId)}`, { method: "DELETE", headers: { Authorization: `Bearer ${grant}`, "Cache-Control": "no-store" } }); }
  async result(jobId: string, grant: string, signal?: AbortSignal): Promise<BackendArtifact> { const response = await this.request(`/v1/exports/${encodeURIComponent(jobId)}/result`, { headers: { Authorization: `Bearer ${grant}`, "Cache-Control": "no-store" } }, signal); const bytes = await response.blob(); if (bytes.type !== "video/mp4") throw new Error("Server result is not an MP4"); return { filename: "aurelius-video.mp4", mimeType: "video/mp4", bytes }; }
}
