import { frameIndexToTimeUs, timeUs, timeUsToFrameIndex, type ProjectDoc } from "@aurelius/project-model";

export interface AudioPreview { readonly clipId: string; readonly element: Pick<HTMLAudioElement, "currentTime" | "paused" | "play" | "pause">; }
export class TimelineTransport {
  private running = false; private lastMs = 0;
  constructor(private readonly project: () => ProjectDoc, private readonly readPlayhead: () => number, private readonly setPlayhead: (value: number) => void, private readonly now = () => performance.now()) {}
  play(): void { this.running = true; this.lastMs = this.now(); }
  pause(audio: readonly AudioPreview[] = []): void { this.running = false; audio.forEach(({ element }) => element.pause()); }
  tick(audio: readonly AudioPreview[] = []): void { if (!this.running) return; const current = this.now(); const elapsed = Math.max(0, current - this.lastMs); this.lastMs = current; const doc = this.project(); const aligned = frameIndexToTimeUs(timeUsToFrameIndex(timeUs(Math.round(this.readPlayhead() + elapsed * 1000)), doc.composition.frameRate, "nearest"), doc.composition.frameRate); this.setPlayhead(aligned); this.sync(audio); }
  sync(audio: readonly AudioPreview[]): void { const doc = this.project(); const playhead = this.readPlayhead(); const halfFrame = frameIndexToTimeUs(timeUsToFrameIndex(timeUs(500_000), doc.composition.frameRate, "nearest"), doc.composition.frameRate); for (const preview of audio) { const clip = doc.clips[preview.clipId]; if (!clip || clip.kind !== "audio" || playhead < clip.startUs || playhead >= clip.startUs + clip.durationUs) { preview.element.pause(); continue; } const expected = (clip.sourceInUs + playhead - clip.startUs) / 1_000_000; if (Math.abs(preview.element.currentTime - expected) * 1_000_000 >= halfFrame) preview.element.currentTime = expected; if (this.running && preview.element.paused) void preview.element.play().catch(() => {}); } }
}
