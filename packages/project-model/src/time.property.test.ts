import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  frameIndex, frameIndexToTimeUs, frameRate, rangesOverlap, timeRange,
  timeUsToFrameIndex,
} from "./time";

const rates = [frameRate(24, 1), frameRate(30, 1), frameRate(60, 1)] as const;
const maxFrame = 100_000_000;
const config = { seed: 20_260_912, numRuns: 250 } as const;

describe("timeline conversion properties", () => {
  for (const rate of rates) {
    it(`${rate.numerator} fps round-trips canonical frames`, () => {
      fc.assert(fc.property(fc.integer({ min: 0, max: maxFrame }), (rawFrame) => {
        const frame = frameIndex(rawFrame);
        const canonical = frameIndexToTimeUs(frame, rate, "nearest");
        expect(timeUsToFrameIndex(canonical, rate, "nearest")).toBe(frame);
      }), config);
    });

    it(`${rate.numerator} fps remains stable after 100 conversions`, () => {
      fc.assert(fc.property(fc.integer({ min: 0, max: maxFrame }), (rawFrame) => {
        const initial = frameIndex(rawFrame);
        let current = initial;
        for (let index = 0; index < 100; index += 1) {
          current = timeUsToFrameIndex(frameIndexToTimeUs(current, rate), rate, "nearest");
        }
        expect(current).toBe(initial);
      }), config);
    });

    it(`${rate.numerator} fps adjacent timestamps and ranges are unambiguous`, () => {
      fc.assert(fc.property(fc.integer({ min: 0, max: maxFrame - 2 }), (rawFrame) => {
        const start = frameIndexToTimeUs(frameIndex(rawFrame), rate);
        const middle = frameIndexToTimeUs(frameIndex(rawFrame + 1), rate);
        const end = frameIndexToTimeUs(frameIndex(rawFrame + 2), rate);
        expect(middle).toBeGreaterThan(start);
        expect([Math.floor(1_000_000 / rate.numerator), Math.ceil(1_000_000 / rate.numerator)])
          .toContain(middle - start);
        expect(rangesOverlap(timeRange(start, middle), timeRange(middle, end))).toBe(false);
      }), config);
    });
  }

  it.each([0, 1, 60 * 60, 60 * 60 * 60, maxFrame])("covers fixed frame %i", (value) => {
    for (const rate of rates) {
      const frame = frameIndex(value);
      expect(timeUsToFrameIndex(frameIndexToTimeUs(frame, rate), rate, "nearest")).toBe(frame);
    }
  });

  it("covers the maximum canonical frame whose timestamp is a safe integer", () => {
    for (const rate of rates) {
      const maximum = Number((BigInt(Number.MAX_SAFE_INTEGER) * BigInt(rate.numerator)) / 1_000_000n);
      const frame = frameIndex(maximum);
      const timestamp = frameIndexToTimeUs(frame, rate, "floor");
      expect(Number.isSafeInteger(timestamp)).toBe(true);
      expect(timeUsToFrameIndex(timestamp, rate, "nearest")).toBe(frame);
    }
  });
});
