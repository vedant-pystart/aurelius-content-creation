import type { FrameRate, TimeUs } from "./time";

export type EntityId = string;
export type AspectHeight = 1920 | 1350 | 1080;
export type TrackKind = "primary" | "overlay" | "text" | "caption" | "audio";
export type ClipKind = "video" | "image" | "audio" | "text";

export interface Composition {
  readonly width: 1080;
  readonly height: AspectHeight;
  readonly frameRate: FrameRate;
  readonly background: string;
}

export interface BrandTokens {
  readonly background: string;
  readonly text: string;
  readonly accent: string;
  readonly border: string;
  readonly gold: string;
  readonly headingFont: string;
  readonly bodyFont: string;
}

export interface AssetRef {
  readonly id: EntityId;
  readonly name: string;
  readonly kind: "video" | "image" | "audio";
  readonly mimeType: string;
  readonly byteSize: number;
  readonly durationUs?: TimeUs;
  readonly width?: number;
  readonly height?: number;
  readonly fingerprint: string;
}

export interface Track {
  readonly id: EntityId;
  readonly name: string;
  readonly kind: TrackKind;
  readonly muted: boolean;
  readonly locked: boolean;
  readonly clipOrder: readonly EntityId[];
}

export interface Transform {
  readonly x: number;
  readonly y: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly rotationDeg: number;
  readonly opacity: number;
}

export interface Crop {
  readonly mode: "fit" | "fill" | "blur";
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export interface Motion {
  readonly treatment: "none" | "editorial-rise" | "focus-pull" | "masked-reveal" | "word-cascade" | "impact-slam" | "film-title-fade";
  readonly entranceUs: TimeUs;
  readonly holdUs: TimeUs;
  readonly exitUs: TimeUs;
  readonly staggerUs: TimeUs;
}

interface ClipBase {
  readonly id: EntityId;
  readonly trackId: EntityId;
  readonly startUs: TimeUs;
  readonly durationUs: TimeUs;
  readonly layer: number;
  readonly enabled: boolean;
}

export interface MediaClip extends ClipBase {
  readonly kind: "video" | "image";
  readonly assetId: EntityId;
  readonly sourceInUs: TimeUs;
  readonly sourceDurationUs: TimeUs;
  readonly transform?: Transform;
  readonly crop?: Crop;
  /** Legacy visual-media mix fields are retained for non-destructive v2 migration. */
  readonly volume: number;
  readonly fadeInUs: TimeUs;
  readonly fadeOutUs: TimeUs;
}

export type AudioRole = "source" | "music" | "voiceover";

/** Audio has an independent timeline life; it never mutates the visual clip or source bytes. */
export interface AudioClip extends ClipBase {
  readonly kind: "audio";
  readonly role: AudioRole;
  /** A source track references video. Music and voiceover reference audio assets only. */
  readonly assetId: EntityId;
  readonly sourceInUs: TimeUs;
  readonly sourceDurationUs: TimeUs;
  readonly muted: boolean;
  readonly volume: number;
  readonly fadeInUs: TimeUs;
  readonly fadeOutUs: TimeUs;
}

export interface AureliusStyleBinding {
  readonly preset: "editorial" | "cinema" | "impact" | "quote" | "reel-captions";
  readonly role: "heading" | "quote" | "label" | "credit" | "body" | "end-card";
  /** Presentation keys intentionally changed by the creator and protected from preset updates. */
  readonly detachedFields: readonly ("textStyleId" | "motion" | "transform")[];
}

export interface TextClip extends ClipBase {
  readonly kind: "text";
  readonly content: string;
  readonly textStyleId: EntityId;
  readonly transform: Transform;
  readonly motion: Motion;
  readonly aurelius?: AureliusStyleBinding;
}

export type Clip = MediaClip | AudioClip | TextClip;

export interface Transition {
  readonly id: EntityId;
  readonly trackId: EntityId;
  readonly fromClipId: EntityId;
  readonly toClipId: EntityId;
  readonly kind: "crossfade" | "dip-to-black" | "editorial-wipe";
  readonly durationUs: TimeUs;
}

export interface CaptionCue {
  readonly id: EntityId;
  readonly trackId: EntityId;
  readonly startUs: TimeUs;
  readonly endUs: TimeUs;
  readonly text: string;
  readonly emphasisWordIndexes: readonly number[];
  readonly position: "lower" | "center";
  readonly textStyleId: EntityId;
}

export interface CaptionTrackSettings {
  readonly maxWords: number;
  readonly defaultTextStyleId: EntityId;
}

export interface TextStyle {
  readonly id: EntityId;
  readonly name: string;
  readonly family: "Crimson Pro" | "Karla";
  readonly weight: 400 | 500 | 600 | 700;
  readonly sizePx: number;
  readonly lineHeight: number;
  readonly letterSpacingEm: number;
  readonly color: string;
  readonly align: "left" | "center" | "right";
}

export interface Marker {
  readonly id: EntityId;
  readonly timeUs: TimeUs;
  readonly label: string;
  readonly color: string;
}

export interface ProjectDoc {
  readonly schemaVersion: 3;
  readonly id: EntityId;
  readonly revision: number;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly composition: Composition;
  readonly brandTokens: BrandTokens;
  readonly assetOrder: readonly EntityId[];
  readonly assets: Readonly<Record<EntityId, AssetRef>>;
  readonly trackOrder: readonly EntityId[];
  readonly tracks: Readonly<Record<EntityId, Track>>;
  readonly captionSettings: Readonly<Record<EntityId, CaptionTrackSettings>>;
  readonly clips: Readonly<Record<EntityId, Clip>>;
  readonly transitionOrder: readonly EntityId[];
  readonly transitions: Readonly<Record<EntityId, Transition>>;
  readonly captionCueOrder: readonly EntityId[];
  readonly captionCues: Readonly<Record<EntityId, CaptionCue>>;
  readonly textStyleOrder: readonly EntityId[];
  readonly textStyles: Readonly<Record<EntityId, TextStyle>>;
  readonly markerOrder: readonly EntityId[];
  readonly markers: Readonly<Record<EntityId, Marker>>;
}
