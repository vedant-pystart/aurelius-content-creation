import { z } from "zod";

export const CURRENT_SCHEMA_VERSION = 3 as const;

const id = z.string().min(1).max(160);
const isoDate = z.iso.datetime({ offset: true });
const time = z.number().int().nonnegative().safe();
const finite = z.number().finite();
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const orderedIds = z.array(id);
const entityRecord = <T extends z.ZodType>(value: T) => z.record(id, value);

export const FrameRateSchema = z.strictObject({
  numerator: z.union([z.literal(24), z.literal(30), z.literal(60)]),
  denominator: z.literal(1),
});

const TransformSchema = z.strictObject({
  x: finite,
  y: finite,
  scaleX: finite.positive(),
  scaleY: finite.positive(),
  rotationDeg: finite,
  opacity: finite.min(0).max(1),
});

const CropSchema = z.strictObject({
  mode: z.enum(["fit", "fill", "blur"]),
  x: finite,
  y: finite,
  zoom: finite.positive(),
});

const MotionSchema = z.strictObject({
  treatment: z.enum(["none", "editorial-rise", "focus-pull", "masked-reveal", "word-cascade", "impact-slam", "film-title-fade"]),
  entranceUs: time,
  holdUs: time,
  exitUs: time,
  staggerUs: time,
});

const ClipBaseShape = {
  id,
  trackId: id,
  startUs: time,
  durationUs: time.positive(),
  layer: z.number().int().nonnegative().safe(),
  enabled: z.boolean(),
};

const MediaFields = {
  ...ClipBaseShape,
  assetId: id,
  sourceInUs: time,
  sourceDurationUs: time.positive(),
  transform: TransformSchema.optional(),
  crop: CropSchema.optional(),
  volume: finite.min(0).max(2),
  fadeInUs: time,
  fadeOutUs: time,
};

const VideoClipSchema = z.strictObject({ kind: z.literal("video"), ...MediaFields });
const ImageClipSchema = z.strictObject({ kind: z.literal("image"), ...MediaFields });
const AudioClipSchema = z.strictObject({
  kind: z.literal("audio"), ...ClipBaseShape, assetId: id, sourceInUs: time, sourceDurationUs: time.positive(),
  role: z.enum(["source", "music", "voiceover"]), muted: z.boolean(), volume: finite.min(0).max(2), fadeInUs: time, fadeOutUs: time,
});
const TextClipSchema = z.strictObject({
  kind: z.literal("text"),
  ...ClipBaseShape,
  content: z.string().max(20_000),
  textStyleId: id,
  transform: TransformSchema,
  motion: MotionSchema,
  aurelius: z.strictObject({ preset: z.enum(["editorial", "cinema", "impact", "quote", "reel-captions"]), role: z.enum(["heading", "quote", "label", "credit", "body", "end-card"]), detachedFields: z.array(z.enum(["textStyleId", "motion", "transform"])).max(3) }).optional(),
});

export const ClipSchema = z.discriminatedUnion("kind", [VideoClipSchema, ImageClipSchema, AudioClipSchema, TextClipSchema]);

export const ProjectDocSchema = z.strictObject({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  id,
  revision: z.number().int().nonnegative().safe(),
  title: z.string().min(1).max(240),
  createdAt: isoDate,
  updatedAt: isoDate,
  composition: z.strictObject({
    width: z.literal(1080),
    height: z.union([z.literal(1920), z.literal(1350), z.literal(1080)]),
    frameRate: FrameRateSchema,
    background: color,
  }),
  brandTokens: z.strictObject({
    background: color, text: color, accent: color, border: color, gold: color,
    headingFont: z.literal("Crimson Pro"), bodyFont: z.literal("Karla"),
  }),
  assetOrder: orderedIds,
  assets: entityRecord(z.strictObject({
    id, name: z.string().min(1).max(500), kind: z.enum(["video", "image", "audio"]),
    mimeType: z.string().min(1).max(160), byteSize: z.number().int().nonnegative().safe(),
    durationUs: time.optional(), width: z.number().int().positive().safe().optional(),
    height: z.number().int().positive().safe().optional(), fingerprint: z.string().min(1).max(256),
  })),
  trackOrder: orderedIds,
  tracks: entityRecord(z.strictObject({
    id, name: z.string().min(1).max(160), kind: z.enum(["primary", "overlay", "text", "caption", "audio"]),
    muted: z.boolean(), locked: z.boolean(), clipOrder: orderedIds,
  })),
  captionSettings: entityRecord(z.strictObject({ maxWords: z.number().int().min(1).max(20), defaultTextStyleId: id })),
  clips: entityRecord(ClipSchema),
  transitionOrder: orderedIds,
  transitions: entityRecord(z.strictObject({
    id, trackId: id, fromClipId: id, toClipId: id,
    kind: z.enum(["crossfade", "dip-to-black", "editorial-wipe"]), durationUs: time.positive(),
  })),
  captionCueOrder: orderedIds,
  captionCues: entityRecord(z.strictObject({
    id, trackId: id, startUs: time, endUs: time, text: z.string().min(1).max(10_000),
    emphasisWordIndexes: z.array(z.number().int().nonnegative().safe()), position: z.enum(["lower", "center"]), textStyleId: id,
  })),
  textStyleOrder: orderedIds,
  textStyles: entityRecord(z.strictObject({
    id, name: z.string().min(1).max(160), family: z.enum(["Crimson Pro", "Karla"]),
    weight: z.union([z.literal(400), z.literal(500), z.literal(600), z.literal(700)]),
    sizePx: finite.positive(), lineHeight: finite.positive(), letterSpacingEm: finite,
    color, align: z.enum(["left", "center", "right"]),
  })),
  markerOrder: orderedIds,
  markers: entityRecord(z.strictObject({ id, timeUs: time, label: z.string().max(500), color })),
});
