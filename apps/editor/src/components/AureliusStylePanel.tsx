import { allAureliusStyles, pacingSummary, type AureliusPacing } from "@aurelius/composition";
import type { ProjectDoc } from "@aurelius/project-model";
import type { TimelineSession } from "../timeline/timeline-session";
import { AureliusCreationSession } from "../aurelius/creation-session";
import { VisualFontPicker } from "./VisualFontPicker";

export function AureliusStylePanel({ project, session, writable }: { project: ProjectDoc; session: TimelineSession; writable: boolean }) {
  const creation = new AureliusCreationSession(session); const firstStyle = project.textStyles[project.textStyleOrder[0] ?? ""];
  const setFont = (family: "Crimson Pro" | "Karla") => { if (!firstStyle) return; session.commit({ type: "aurelius/applyStyle", expectedRevision: project.revision, textStyleUpdates: [{ ...firstStyle, family }], clipUpdates: [] }); };
  return <section className="aurelius-panel aurelius-style-panel" aria-label="Aurelius style controls"><div><p className="kicker">Aurelius direction</p><h2>Style and pacing</h2></div><div className="style-options">{allAureliusStyles().map((style) => <button key={style.id} disabled={!writable} onClick={() => creation.applyStyle(style.id)}><strong>{style.name}</strong><small>{style.description}</small></button>)}</div><div className="pacing-options" role="group" aria-label="Pacing mode">{(["calm", "engaging", "high-retention"] as const).map((mode) => <button key={mode} disabled={!writable} onClick={() => creation.pace(mode)}><strong>{mode === "high-retention" ? "High Retention" : mode[0]!.toUpperCase() + mode.slice(1)}</strong><small>{pacingSummary[mode]}</small></button>)}</div>{firstStyle ? <label className="font-control">Typeface<VisualFontPicker value={firstStyle.family} disabled={!writable} onChange={setFont} /></label> : null}<details><summary>Advanced motion and composition</summary><p>Directly select a text layer to move it on the canvas. Motion values stay editable with every generated layer.</p></details></section>;
}
