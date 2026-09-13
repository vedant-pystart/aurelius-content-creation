import { useEffect, useRef, useState } from "react";
import type { ResolvedLayer } from "@aurelius/composition";

export function InlineTextEditor({ layer, canvasHeight, initialValue, onCommit, onCancel }: { layer: ResolvedLayer; canvasHeight: number; initialValue: string; onCommit(value: string): void; onCancel(): void }) {
  const ref = useRef<HTMLTextAreaElement>(null); const [composing, setComposing] = useState(false);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  return <textarea ref={ref} className="inline-text-editor" aria-label="Edit canvas text" defaultValue={initialValue} style={{ left: `${layer.bounds.x / 10.8}%`, top: `${layer.bounds.y / canvasHeight * 100}%`, width: `${layer.bounds.width / 10.8}%`, height: `${Math.max(layer.bounds.height, 42) / canvasHeight * 100}%`, fontSize: `${(layer.text?.fontSize ?? 30) / 10.8}cqw`, lineHeight: `${(layer.text?.lineHeight ?? 36) / 10.8}cqw`, transform: `rotate(${layer.transform.rotationDeg}deg)` }} onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)} onBlur={(event) => { if (!composing) onCommit(event.currentTarget.value); }} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onCancel(); } if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); onCommit(event.currentTarget.value); } }} />;
}
