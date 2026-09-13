import type { Motion, ProjectDoc, TextStyle } from "@aurelius/project-model";

export const AURELIUS_STYLES = ["editorial", "cinema", "impact", "quote", "reel-captions"] as const;
export type AureliusStyleId = (typeof AURELIUS_STYLES)[number];
export const AURELIUS_PACING = ["calm", "engaging", "high-retention"] as const;
export type AureliusPacing = (typeof AURELIUS_PACING)[number];
export const AURELIUS_TEMPLATES = ["nuclear-quote", "movie-clip", "hook-reel"] as const;
export type AureliusTemplate = (typeof AURELIUS_TEMPLATES)[number];
export type AureliusMotionName = Motion["treatment"];

export interface AureliusStyleDefinition {
  readonly id: AureliusStyleId;
  readonly name: string;
  readonly description: string;
  readonly defaultMotion: Motion["treatment"];
  readonly textStyle: Omit<TextStyle, "id">;
  readonly captionPosition: "lower" | "center";
}

export interface TemplateInput {
  readonly template: AureliusTemplate;
  readonly hook: string;
  readonly body?: string;
  readonly attribution?: string;
  readonly closing?: string;
  readonly videoAssetId?: string;
  readonly style?: AureliusStyleId;
  readonly createId: () => string;
}

export interface MotionValues { readonly opacity: number; readonly translateY: number; readonly scale: number; readonly blurPx: number; readonly clipProgress: number; }
export type PacingScope = "all" | readonly string[];
export type ProjectSnapshot = ProjectDoc;
