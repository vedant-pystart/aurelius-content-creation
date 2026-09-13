import type { Draft, Patch } from "immer";
import type { AssetRef, AspectHeight, AudioClip, CaptionCue, Clip, Crop, Motion, ProjectDoc, TextClip, TextStyle, Transform, Transition } from "../model";
import type { TimeUs } from "../time";

interface CommandBase { readonly expectedRevision: number }

/** Fully resolved ordinary entities. This is intentionally data, never a template runtime. */
export interface TemplateFragment {
  readonly clips: readonly Clip[];
  readonly captionCues: readonly CaptionCue[];
  readonly textStyles: readonly TextStyle[];
  readonly markers: readonly ProjectDoc["markers"][string][];
  readonly transitions: readonly Transition[];
}

export type EditorCommand =
  | (CommandBase & { readonly type: "project/rename"; readonly title: string })
  | (CommandBase & { readonly type: "asset/register"; readonly asset: AssetRef; readonly orderIndex?: number })
  | (CommandBase & { readonly type: "asset/rename"; readonly assetId: string; readonly name: string })
  | (CommandBase & { readonly type: "asset/replaceMetadata"; readonly assetId: string; readonly metadata: Omit<AssetRef, "id"> })
  | (CommandBase & { readonly type: "asset/remove"; readonly assetId: string })
  | (CommandBase & { readonly type: "composition/setBackground"; readonly color: string })
  | (CommandBase & { readonly type: "composition/setFormat"; readonly height: AspectHeight })
  | (CommandBase & { readonly type: "clip/add"; readonly clip: Clip; readonly orderIndex?: number })
  | (CommandBase & { readonly type: "clip/remove"; readonly clipId: string })
  | (CommandBase & { readonly type: "clip/setTiming"; readonly clipId: string; readonly startUs: TimeUs; readonly durationUs: TimeUs; readonly sourceInUs?: TimeUs; readonly sourceDurationUs?: TimeUs })
  | (CommandBase & { readonly type: "clip/setTransform"; readonly clipId: string; readonly transform: Transform })
  | (CommandBase & { readonly type: "clip/setCrop"; readonly clipId: string; readonly crop: Crop })
  | (CommandBase & { readonly type: "clip/setLayer"; readonly clipId: string; readonly layer: number })
  | (CommandBase & { readonly type: "text/setContent"; readonly clipId: string; readonly content: string })
  | (CommandBase & { readonly type: "text/add"; readonly clip: TextClip; readonly orderIndex?: number })
  | (CommandBase & { readonly type: "timeline/move"; readonly clipId: string; readonly startUs: TimeUs })
  | (CommandBase & { readonly type: "timeline/trim"; readonly clipId: string; readonly startUs: TimeUs; readonly durationUs: TimeUs; readonly sourceInUs?: TimeUs })
  | (CommandBase & { readonly type: "timeline/split"; readonly clipId: string; readonly newClipId: string; readonly atUs: TimeUs })
  | (CommandBase & { readonly type: "timeline/duplicate"; readonly clipId: string; readonly newClipId: string; readonly startUs: TimeUs })
  | (CommandBase & { readonly type: "timeline/reorderLayer"; readonly clipId: string; readonly layer: number })
  | (CommandBase & { readonly type: "timeline/delete"; readonly clipId: string })
  | (CommandBase & { readonly type: "timeline/rippleDelete"; readonly clipId: string })
  | (CommandBase & { readonly type: "caption/add"; readonly cue: CaptionCue })
  | (CommandBase & { readonly type: "caption/setTiming"; readonly cueId: string; readonly startUs: TimeUs; readonly endUs: TimeUs })
  | (CommandBase & { readonly type: "caption/update"; readonly cueId: string; readonly text?: string; readonly position?: CaptionCue["position"]; readonly textStyleId?: string; readonly emphasisWordIndexes?: readonly number[] })
  | (CommandBase & { readonly type: "caption/replaceAll"; readonly cues: readonly CaptionCue[] })
  | (CommandBase & { readonly type: "caption/setSettings"; readonly trackId: string; readonly maxWords: number; readonly defaultTextStyleId: string })
  | (CommandBase & { readonly type: "audio/add"; readonly clip: AudioClip })
  | (CommandBase & { readonly type: "audio/addSourceFromVideo"; readonly clip: AudioClip })
  | (CommandBase & { readonly type: "audio/setMix"; readonly clipId: string; readonly muted?: boolean; readonly volume?: number; readonly fadeInUs?: TimeUs; readonly fadeOutUs?: TimeUs })
  | (CommandBase & { readonly type: "audio/replaceAsset"; readonly clipId: string; readonly assetId: string })
  | (CommandBase & { readonly type: "text/setMotion"; readonly clipId: string; readonly motion: Motion })
  | (CommandBase & { readonly type: "template/compile"; readonly fragment: TemplateFragment })
  | (CommandBase & { readonly type: "aurelius/applyStyle"; readonly textStyleUpdates: readonly TextStyle[]; readonly clipUpdates: readonly { id: string; textStyleId?: string; motion?: Motion }[] })
  | (CommandBase & { readonly type: "aurelius/applyPacing"; readonly clipTimings: readonly { id: string; startUs: TimeUs; durationUs: TimeUs; motion?: Motion }[]; readonly cueTimings: readonly { id: string; startUs: TimeUs; endUs: TimeUs }[] })
  | (CommandBase & { readonly type: "transition/add"; readonly transition: Transition })
  | (CommandBase & { readonly type: "transition/update"; readonly transitionId: string; readonly durationUs: TimeUs; readonly kind?: Transition["kind"] })
  | (CommandBase & { readonly type: "transition/remove"; readonly transitionId: string });

export interface CommandExecutionContext {
  readonly committedAtIso: string;
}

export interface CommandTransaction {
  readonly label: string;
  readonly baseRevision: number;
  readonly nextRevision: number;
  readonly command: EditorCommand;
  readonly forwardPatches: readonly Patch[];
  readonly inversePatches: readonly Patch[];
  readonly estimatedBytes: number;
}

export interface CommandResult {
  readonly nextDoc: ProjectDoc;
  readonly transaction: CommandTransaction;
}

export interface CommandHandler<C extends EditorCommand = EditorCommand> {
  readonly label: (command: C) => string;
  readonly apply: (draft: Draft<ProjectDoc>, command: C) => void;
}

export type CommandHandlerRegistry = {
  readonly [Kind in EditorCommand["type"]]: CommandHandler<Extract<EditorCommand, { readonly type: Kind }>>;
};
