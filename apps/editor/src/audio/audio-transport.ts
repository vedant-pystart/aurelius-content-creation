import { frameIndexToTimeUs, timeUs, timeUsToFrameIndex, type AudioClip, type ProjectDoc } from "@aurelius/project-model";

export interface ActiveAudio { readonly clip: AudioClip; readonly sourceTimeUs: number; }
export interface VisualSyncSink { seek(timeUs: number): void; }
export interface AudioMasterSnapshot { readonly playheadUs: number; readonly playing: boolean; readonly active: readonly ActiveAudio[]; }
type Listener = (snapshot: AudioMasterSnapshot) => void;

/** Audio-clock anchored transport. UI paint merely observes its integer playhead. */
export class AudioMasterTransport {
  private listeners = new Set<Listener>(); private sink: VisualSyncSink | undefined; private playhead = 0; private playing = false; private anchorClock = 0; private anchorUs = 0; private timer: ReturnType<typeof setInterval> | undefined;
  constructor(private readonly project: () => ProjectDoc, private readonly clock = () => performance.now() / 1000) {}
  private duration(): number { return Math.max(0, ...Object.values(this.project().clips).map((clip) => clip.startUs + clip.durationUs), ...Object.values(this.project().captionCues).map((cue) => cue.endUs)); }
  private nowUs(): number { return this.playing ? Math.min(this.duration(), Math.round(this.anchorUs + (this.clock() - this.anchorClock) * 1_000_000)) : this.playhead; }
  private active(playhead = this.nowUs()): ActiveAudio[] { return Object.values(this.project().clips).filter((clip): clip is AudioClip => clip.kind === "audio" && clip.enabled && !clip.muted && playhead >= clip.startUs && playhead < clip.startUs + clip.durationUs).map((clip) => ({ clip, sourceTimeUs: clip.sourceInUs + playhead - clip.startUs })); }
  private publish(): void { this.playhead = this.nowUs(); if (this.playhead >= this.duration()) this.pause(); const snapshot = Object.freeze({ playheadUs: this.playhead, playing: this.playing, active: this.active(this.playhead) }); this.sink?.seek(this.playhead); this.listeners.forEach((listener) => listener(snapshot)); }
  subscribe(listener: Listener): () => void { this.listeners.add(listener); listener({ playheadUs: this.playhead, playing: this.playing, active: this.active(this.playhead) }); return () => this.listeners.delete(listener); }
  attachVisualSink(sink?: VisualSyncSink): void { this.sink = sink; sink?.seek(this.playhead); }
  play(): void { if (this.playing) return; this.anchorUs = this.playhead; this.anchorClock = this.clock(); this.playing = true; this.timer = setInterval(() => this.publish(), 33); this.publish(); }
  pause(): void { if (!this.playing && !this.timer) return; this.playhead = this.nowUs(); this.playing = false; if (this.timer) clearInterval(this.timer); this.timer = undefined; this.publish(); }
  seek(value: number): void { this.playhead = Math.max(0, Math.min(this.duration(), Math.round(value))); this.anchorUs = this.playhead; this.anchorClock = this.clock(); this.publish(); }
  step(direction: -1 | 1): void { const rate = this.project().composition.frameRate; const current = timeUsToFrameIndex(timeUs(this.playhead), rate, "nearest"); const next = Math.max(0, Number(current) + direction); this.seek(frameIndexToTimeUs(next as never, rate)); }
  setProjectChanged(): void { this.seek(this.playhead); }
  visibility(hidden: boolean): void { if (hidden) this.pause(); }
  dispose(): void { this.pause(); this.listeners.clear(); this.sink = undefined; }
}
