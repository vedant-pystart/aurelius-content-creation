export type TimeUs = number & { readonly __brand: "TimeUs" };
export type FrameIndex = number & { readonly __brand: "FrameIndex" };
export type FrameRate = Readonly<{ numerator: 24 | 30 | 60; denominator: 1 }>;
export type TimeRange = Readonly<{ startUs: TimeUs; endUs: TimeUs }>;
export type RoundingMode = "floor" | "ceil" | "nearest";

const MICROS_PER_SECOND = 1_000_000n;

function safeNonnegativeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a nonnegative safe integer`);
  }
  return value;
}

export function timeUs(value: number): TimeUs {
  return safeNonnegativeInteger(value, "TimeUs") as TimeUs;
}

export function frameIndex(value: number): FrameIndex {
  return safeNonnegativeInteger(value, "FrameIndex") as FrameIndex;
}

export function frameRate(numerator: number, denominator: number): FrameRate {
  if ((numerator !== 24 && numerator !== 30 && numerator !== 60) || denominator !== 1) {
    throw new RangeError("FrameRate must be one of 24/1, 30/1, or 60/1");
  }
  return Object.freeze({ numerator, denominator });
}

function divide(numerator: bigint, denominator: bigint, rounding: RoundingMode): bigint {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder === 0n || rounding === "floor") return quotient;
  if (rounding === "ceil") return quotient + 1n;
  return quotient + (remainder * 2n >= denominator ? 1n : 0n);
}

function safeBigIntToNumber(value: bigint, label: string): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError(`${label} exceeds the safe integer range`);
  return Number(value);
}

export function frameIndexToTimeUs(
  frame: FrameIndex,
  rate: FrameRate,
  rounding: RoundingMode = "nearest",
): TimeUs {
  const value = divide(
    BigInt(frame) * MICROS_PER_SECOND * BigInt(rate.denominator),
    BigInt(rate.numerator),
    rounding,
  );
  return timeUs(safeBigIntToNumber(value, "Frame timestamp"));
}

export function timeUsToFrameIndex(
  value: TimeUs,
  rate: FrameRate,
  rounding: RoundingMode,
): FrameIndex {
  const frame = divide(
    BigInt(value) * BigInt(rate.numerator),
    MICROS_PER_SECOND * BigInt(rate.denominator),
    rounding,
  );
  return frameIndex(safeBigIntToNumber(frame, "Frame index"));
}

/** Creates a half-open interval `[startUs, endUs)`. */
export function timeRange(startUs: TimeUs, endUs: TimeUs): TimeRange {
  if (endUs < startUs) throw new RangeError("TimeRange endUs must be greater than or equal to startUs");
  return Object.freeze({ startUs, endUs });
}

export function rangeContains(range: TimeRange, value: TimeUs): boolean {
  return value >= range.startUs && value < range.endUs;
}

export function rangesOverlap(left: TimeRange, right: TimeRange): boolean {
  return left.startUs < right.endUs && right.startUs < left.endUs;
}

export function intersectRanges(left: TimeRange, right: TimeRange): TimeRange | null {
  const start = Math.max(left.startUs, right.startUs);
  const end = Math.min(left.endUs, right.endUs);
  return start < end ? timeRange(timeUs(start), timeUs(end)) : null;
}

export function clampTime(value: TimeUs, range: TimeRange): TimeUs {
  return timeUs(Math.min(Math.max(value, range.startUs), range.endUs));
}
