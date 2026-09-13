import type { Crop, ProjectDoc, Transform } from "@aurelius/project-model";

export interface LogicalRect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export interface SafeAreas { readonly content: LogicalRect; readonly title: LogicalRect; readonly bottomUi: LogicalRect }
export interface TextLayout { readonly lines: readonly string[]; readonly fontSize: number; readonly lineHeight: number; readonly align: "left" | "center" | "right"; readonly fontFamily: "Crimson Pro" | "Karla"; readonly weight: number }
export interface CropGeometry { readonly mode: Crop["mode"]; readonly sourceX: number; readonly sourceY: number; readonly sourceWidth: number; readonly sourceHeight: number; readonly blurBackdrop: boolean }
export interface ResolvedLayer {
  readonly id: string;
  readonly kind: "image" | "video" | "text";
  readonly assetId?: string | undefined;
  readonly visible: true;
  readonly layer: number;
  readonly trackIndex: number;
  readonly compositionTimeUs: number;
  readonly sourceTimeUs?: number | undefined;
  readonly transform: Transform;
  readonly bounds: LogicalRect;
  readonly crop?: CropGeometry | undefined;
  readonly opacity: number;
  readonly text?: TextLayout | undefined;
}
export interface ResolvedFrame {
  readonly frameIndex: number;
  readonly timeUs: number;
  readonly width: 1080;
  readonly height: ProjectDoc["composition"]["height"];
  readonly background: string;
  readonly safeAreas: SafeAreas;
  readonly layers: readonly ResolvedLayer[];
}
export interface AlignmentTarget { readonly id: string; readonly axis: "x" | "y"; readonly kind: "edge" | "center" | "safe"; readonly value: number }
