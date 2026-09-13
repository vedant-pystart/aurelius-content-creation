import type { BinaryInput } from "./types";

const CHUNK = 1024 * 1024;
export async function fingerprintMedia(input: BinaryInput): Promise<string> {
  const first = new Uint8Array(await input.slice(0, Math.min(CHUNK, input.size)).arrayBuffer());
  const lastStart = Math.max(0, input.size - CHUNK);
  const last = lastStart === 0 ? new Uint8Array() : new Uint8Array(await input.slice(lastStart, input.size).arrayBuffer());
  const prefix = new TextEncoder().encode(`${input.size}:${Math.trunc(input.lastModified)}:`);
  const all = new Uint8Array(prefix.length + first.length + last.length);
  all.set(prefix); all.set(first, prefix.length); all.set(last, prefix.length + first.length);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", all));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
