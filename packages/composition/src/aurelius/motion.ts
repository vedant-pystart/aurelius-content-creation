import type { Motion } from "@aurelius/project-model";
import type { MotionValues } from "./contracts";

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const easeOut = (value: number) => 1 - (1 - clamp(value)) ** 3;
const easeIn = (value: number) => clamp(value) ** 3;
const calm: MotionValues = { opacity: 1, translateY: 0, scale: 1, blurPx: 0, clipProgress: 1 };

/** A pure frame resolver shared by Player and render. No clock or DOM dependencies. */
export function resolveAureliusMotion(motion: Motion, clipDurationUs: number, localTimeUs: number, reducedMotion = false, wordIndex = 0): MotionValues {
  if (reducedMotion || motion.treatment === "none") return localTimeUs < 0 || localTimeUs >= clipDurationUs ? { ...calm, opacity: 0 } : calm;
  if (localTimeUs < 0 || localTimeUs >= clipDurationUs) return { ...calm, opacity: 0 };
  const enter = motion.entranceUs ? easeOut((localTimeUs - wordIndex * motion.staggerUs) / motion.entranceUs) : 1;
  const exitStart = Math.max(0, clipDurationUs - motion.exitUs);
  const leave = motion.exitUs && localTimeUs > exitStart ? 1 - easeIn((localTimeUs - exitStart) / motion.exitUs) : 1;
  const p = clamp(enter) * clamp(leave);
  switch (motion.treatment) {
    case "editorial-rise": return { opacity: p, translateY: (1 - enter) * 42, scale: 1, blurPx: 0, clipProgress: enter };
    case "focus-pull": return { opacity: p, translateY: 0, scale: 1.06 - enter * .06, blurPx: (1 - enter) * 12, clipProgress: enter };
    case "masked-reveal": return { opacity: p, translateY: 0, scale: 1, blurPx: 0, clipProgress: enter };
    case "word-cascade": return { opacity: p, translateY: (1 - enter) * 24, scale: 1, blurPx: 0, clipProgress: enter };
    case "impact-slam": return { opacity: p, translateY: (1 - enter) * -16, scale: 1.12 - enter * .12, blurPx: 0, clipProgress: enter };
    case "film-title-fade": return { opacity: p, translateY: 0, scale: 1.015, blurPx: 0, clipProgress: enter };
    default: return calm;
  }
}
