import type { AudioClip } from "@aurelius/project-model";
import type { ActiveAudio } from "./audio-transport";

export interface AudioGraphState { readonly duckAmount: number; readonly error?: string; }
interface NodeEntry { readonly element: HTMLAudioElement; readonly gain?: GainNode; readonly source?: MediaElementAudioSourceNode; }

/** Small browser mixer: one lazy context, one element source per active clip, no persisted handles. */
export class BrowserAudioGraph {
  private context: AudioContext | undefined; private readonly nodes = new Map<string, NodeEntry>(); private duckAmount = .35; private error: string | undefined;
  constructor(private readonly sourceFor: (assetId: string) => Promise<string>) {}
  snapshot(): AudioGraphState { return { duckAmount: this.duckAmount, ...(this.error ? { error: this.error } : {}) }; }
  setDuckAmount(value: number): void { this.duckAmount = Math.max(0, Math.min(1, value)); }
  private async node(clip: AudioClip): Promise<NodeEntry> { let entry = this.nodes.get(clip.id); if (entry) return entry; const element = new Audio(await this.sourceFor(clip.assetId)); element.preload = "auto"; element.crossOrigin = "anonymous"; try { this.context ??= new AudioContext(); await this.context.resume(); const source = this.context.createMediaElementSource(element); const gain = this.context.createGain(); source.connect(gain).connect(this.context.destination); entry = { element, source, gain }; } catch (cause) { this.error = cause instanceof Error ? cause.message : "Audio output is unavailable"; entry = { element }; } this.nodes.set(clip.id, entry); return entry; }
  private gain(clip: AudioClip, sourceTimeUs: number, voiceover: boolean): number { if (clip.muted) return 0; const inGain = clip.fadeInUs ? Math.min(1, (sourceTimeUs - clip.sourceInUs) / clip.fadeInUs) : 1; const remaining = clip.sourceDurationUs - (sourceTimeUs - clip.sourceInUs); const outGain = clip.fadeOutUs ? Math.min(1, remaining / clip.fadeOutUs) : 1; return clip.volume * Math.max(0, Math.min(1, inGain, outGain)) * (clip.role === "music" && voiceover ? 1 - this.duckAmount : 1); }
  async sync(active: readonly ActiveAudio[], playing: boolean): Promise<void> { const wanted = new Set(active.map(({ clip }) => clip.id)); const voiceover = active.some(({ clip }) => clip.role === "voiceover"); for (const item of active) { const entry = await this.node(item.clip); const expected = item.sourceTimeUs / 1_000_000; if (Math.abs(entry.element.currentTime - expected) > .04) entry.element.currentTime = expected; const gain = this.gain(item.clip, item.sourceTimeUs, voiceover); if (entry.gain) entry.gain.gain.value = gain; else entry.element.volume = Math.max(0, Math.min(1, gain)); if (playing && gain > 0 && entry.element.paused) void entry.element.play().catch((error: unknown) => { this.error = error instanceof Error ? error.message : "Playback was blocked"; }); }
    for (const [id, entry] of this.nodes) if (!wanted.has(id) || !playing) entry.element.pause(); }
  dispose(): void { for (const entry of this.nodes.values()) { entry.element.pause(); entry.source?.disconnect(); entry.gain?.disconnect(); entry.element.src = ""; } this.nodes.clear(); void this.context?.close(); this.context = undefined; }
}
