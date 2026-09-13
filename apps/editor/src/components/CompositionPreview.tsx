import { useEffect, useMemo, useState } from "react";
import { Player } from "@remotion/player";
import { AureliusComposition, evaluateFrame, type AssetSourceMap } from "@aurelius/composition";
import { deriveProjectDurationUs, frameIndex as toFrameIndex, frameIndexToTimeUs, timeUsToFrameIndex, type ProjectDoc } from "@aurelius/project-model";
import type { AppRuntime } from "../runtime";
import "./composition-preview.css";

export function CompositionPreview({ runtime, project, frameIndex = 0, showSafeAreas = false, className = "" }: { runtime: AppRuntime; project: ProjectDoc; frameIndex?: number; showSafeAreas?: boolean; className?: string }) {
  const [sources, setSources] = useState<AssetSourceMap>({}); const [problem, setProblem] = useState<string | null>(null);
  const visibleAssetIds = useMemo(() => evaluateFrame(project, frameIndex).layers.flatMap((layer) => layer.assetId ? [layer.assetId] : []), [project, frameIndex]);
  useEffect(() => { let live = true; const leases: { release(): void }[] = []; setProblem(null); setSources({});
    void Promise.all(visibleAssetIds.map(async (assetId) => { const asset = project.assets[assetId]; const stored = await runtime.media.get(assetId); if (!asset || !stored || stored.state === "missing") throw new Error("Media needs to be relinked"); const lease = await runtime.resources.acquire(asset.id, asset.fingerprint, stored.sourcePath); leases.push(lease); return [assetId, lease.url] as const; }))
      .then((pairs) => { if (live) setSources(Object.fromEntries(pairs)); })
      .catch((error: unknown) => { if (live) setProblem(error instanceof Error ? error.message : "Preview media could not be loaded"); });
    return () => { live = false; leases.forEach((lease) => lease.release()); };
  }, [project, runtime, visibleAssetIds.join("|")]);
  const durationInFrames = Math.max(1, timeUsToFrameIndex(deriveProjectDurationUs(project) || frameIndexToTimeUs(toFrameIndex(90), project.composition.frameRate), project.composition.frameRate, "ceil"));
  const componentProps = Object.freeze({ project, assetSources: sources, showSafeAreas });
  return <div className={`composition-preview ${className}`} style={{ aspectRatio: `${project.composition.width}/${project.composition.height}` }}>
    {problem ? <div className="composition-preview-state" role="alert">{problem}. Relink it in the media library, then try the preview again.</div> : <Player key={`${project.id}:${project.revision}:${frameIndex}`} className="remotion-player" component={AureliusComposition} inputProps={componentProps} durationInFrames={durationInFrames} compositionWidth={project.composition.width} compositionHeight={project.composition.height} fps={project.composition.frameRate.numerator} initialFrame={Math.min(frameIndex, durationInFrames - 1)} controls={false} clickToPlay={false} />}
  </div>;
}
