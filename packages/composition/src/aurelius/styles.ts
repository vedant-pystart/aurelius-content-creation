import type { ProjectDoc, TextStyle } from "@aurelius/project-model";
import { AURELIUS_STYLES, type AureliusStyleDefinition, type AureliusStyleId } from "./contracts";

const base = { lineHeight: 1.05, letterSpacingEm: -0.02, color: "#2A2522", align: "center" as const };
export const AURELIUS_STYLE_REGISTRY: Readonly<Record<AureliusStyleId, AureliusStyleDefinition>> = {
  editorial: { id: "editorial", name: "Aurelius Editorial", description: "Quiet, considered, and bookish.", defaultMotion: "editorial-rise", textStyle: { name: "Aurelius Editorial", family: "Crimson Pro", weight: 600, sizePx: 96, ...base }, captionPosition: "lower" },
  cinema: { id: "cinema", name: "Aurelius Cinema", description: "Measured title cards for footage.", defaultMotion: "film-title-fade", textStyle: { name: "Aurelius Cinema", family: "Crimson Pro", weight: 500, sizePx: 82, ...base }, captionPosition: "lower" },
  impact: { id: "impact", name: "Aurelius Impact", description: "A bold thought with room to land.", defaultMotion: "impact-slam", textStyle: { name: "Aurelius Impact", family: "Karla", weight: 700, sizePx: 78, lineHeight: 1, letterSpacingEm: -0.04, color: "#2A2522", align: "center" }, captionPosition: "center" },
  quote: { id: "quote", name: "Aurelius Quote", description: "A line worth saving.", defaultMotion: "masked-reveal", textStyle: { name: "Aurelius Quote", family: "Crimson Pro", weight: 600, sizePx: 90, ...base }, captionPosition: "center" },
  "reel-captions": { id: "reel-captions", name: "Aurelius Reel Captions", description: "Clear words for spoken video.", defaultMotion: "word-cascade", textStyle: { name: "Aurelius Reel Captions", family: "Karla", weight: 600, sizePx: 52, lineHeight: 1.12, letterSpacingEm: 0, color: "#2A2522", align: "center" }, captionPosition: "lower" },
};

export function aureliusStyle(style: AureliusStyleId): AureliusStyleDefinition { return AURELIUS_STYLE_REGISTRY[style]; }
export function styleForProject(project: ProjectDoc, style: AureliusStyleId, id: string): TextStyle { return { id, ...aureliusStyle(style).textStyle, color: project.brandTokens.text }; }
export function allAureliusStyles(): readonly AureliusStyleDefinition[] { return AURELIUS_STYLES.map(aureliusStyle); }
