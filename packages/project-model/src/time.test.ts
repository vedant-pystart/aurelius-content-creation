import { describe, expect, it } from "vitest";
import {
  clampTime, frameIndex, frameIndexToTimeUs, frameRate, intersectRanges,
  rangeContains, rangesOverlap, timeRange, timeUs, timeUsToFrameIndex,
} from "./time";

describe("integer timeline time", () => {
  it.each([timeUs, frameIndex])("rejects invalid integers", (constructor) => {
    for (const invalid of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => constructor(invalid)).toThrow(RangeError);
    }
  });

  it("accepts only supported rational frame rates", () => {
    expect(frameRate(24, 1)).toEqual({ numerator: 24, denominator: 1 });
    expect(() => frameRate(25, 1)).toThrow();
    expect(() => frameRate(30, 2)).toThrow();
  });

  it("uses explicit rounding without accumulated deltas", () => {
    const fps = frameRate(30, 1);
    expect(frameIndexToTimeUs(frameIndex(1), fps, "floor")).toBe(33_333);
    expect(frameIndexToTimeUs(frameIndex(1), fps, "ceil")).toBe(33_334);
    expect(frameIndexToTimeUs(frameIndex(1), fps, "nearest")).toBe(33_333);
    expect(timeUsToFrameIndex(timeUs(16_667), fps, "nearest")).toBe(1);
    expect(timeUsToFrameIndex(timeUs(33_333), fps, "floor")).toBe(0);
    expect(timeUsToFrameIndex(timeUs(33_333), fps, "ceil")).toBe(1);
  });

  it("applies half-open interval semantics", () => {
    const left = timeRange(timeUs(0), timeUs(10));
    const right = timeRange(timeUs(10), timeUs(20));
    expect(rangeContains(left, timeUs(0))).toBe(true);
    expect(rangeContains(left, timeUs(10))).toBe(false);
    expect(rangesOverlap(left, right)).toBe(false);
    expect(intersectRanges(left, right)).toBeNull();
    expect(clampTime(timeUs(30), left)).toBe(10);
    expect(() => timeRange(timeUs(2), timeUs(1))).toThrow();
  });
});
