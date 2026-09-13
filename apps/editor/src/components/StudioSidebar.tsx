import { useEffect, useState } from "react";
import { timeUs, type Motion, type ProjectDoc } from "@aurelius/project-model";
import type { TimelineSession, TimelineSnapshot } from "../timeline/timeline-session";
import { AureliusTemplateLauncher } from "./AureliusTemplateLauncher";
import { CaptionStudio } from "./CaptionStudio";
import { AureliusStylePanel } from "./AureliusStylePanel";
import "./studio-sidebar.css";

type Tab = "add" | "motion" | "style" | "captions";
const motions: readonly { id: Motion["treatment"]; name: string; note: string; preview: string }[] = [
  { id: "editorial-rise", name: "Editorial rise", note: "Quiet, deliberate lift", preview: "rise" },
  { id: "masked-reveal", name: "Masked reveal", note: "A considered uncover", preview: "reveal" },
  { id: "impact-slam", name: "Impact", note: "Strong opening beat", preview: "slam" },
  { id: "word-cascade", name: "Word cascade", note: "Caption-first rhythm", preview: "cascade" },
  { id: "film-title-fade", name: "Cinema fade", note: "A slow title-card arrival", preview: "fade" },
  { id: "none", name: "Still", note: "No entrance animation", preview: "still" },
];

function useSnapshot(session: TimelineSession): TimelineSnapshot {
  const [snapshot, setSnapshot] = useState(session.snapshot);
  useEffect(() => session.subscribe(setSnapshot), [session]);
  return snapshot;
}

export function StudioSidebar({ project, session, writable }: { project: ProjectDoc; session: TimelineSession; writable: boolean }) {
  const [tab, setTab] = useState<Tab>("add");
  const snapshot = useSnapshot(session);
  const selected = snapshot.selectedId ? snapshot.project.clips[snapshot.selectedId] : undefined;
  const selectedText = selected?.kind === "text" ? selected : undefined;
  const chooseText = (role: "heading" | "quote" | "label" | "credit" | "body") => {
    if (session.addText(role)) setTab("motion");
  };
  const setMotion = (treatment: Motion["treatment"]) => {
    if (!selectedText) return;
    session.commit({ type: "text/setMotion", expectedRevision: snapshot.project.revision, clipId: selectedText.id, motion: { ...selectedText.motion, treatment } });
  };
  const tune = (field: "entranceUs" | "staggerUs", value: number) => {
    if (!selectedText) return;
    session.commit({ type: "text/setMotion", expectedRevision: snapshot.project.revision, clipId: selectedText.id, motion: { ...selectedText.motion, [field]: timeUs(value) } });
  };
  return <aside className="studio-sidebar" aria-label="Creative tools">
    <div className="studio-tabs" role="tablist" aria-label="Creative tools">
      {(["add", "motion", "style", "captions"] as const).map((item) => <button key={item} role="tab" aria-selected={tab === item} onClick={() => setTab(item)}>{item === "add" ? "Add" : item === "motion" ? "Motion" : item === "style" ? "Style" : "Captions"}</button>)}
    </div>
    <div className="studio-sidebar-content">
      {tab === "add" ? <section className="sidebar-section"><p className="panel-kicker">Build the moment</p><h2>Add to your film</h2><p className="sidebar-intro">Drop media into the library, then add it to the timeline. Or start with a text layer here.</p><div className="quick-add-grid"><button disabled={!writable} onClick={() => chooseText("heading")}><b>H</b><span><strong>Headline</strong><small>A clear opening thought</small></span></button><button disabled={!writable} onClick={() => chooseText("quote")}><b>“</b><span><strong>Quote</strong><small>A considered pull quote</small></span></button><button disabled={!writable} onClick={() => chooseText("label")}><b>↗</b><span><strong>Label</strong><small>Small context or chapter</small></span></button><button disabled={!writable} onClick={() => chooseText("credit")}><b>—</b><span><strong>Credit</strong><small>Author or closing line</small></span></button></div><details className="first-cut"><summary>Make a complete first cut</summary><AureliusTemplateLauncher project={project} session={session} writable={writable} /></details></section> : null}
      {tab === "motion" ? <section className="sidebar-section"><p className="panel-kicker">Text motion</p><h2>{selectedText ? "Choose its arrival" : "Select a text box"}</h2><p className="sidebar-intro">{selectedText ? "Try a treatment. It applies immediately and remains fully editable." : "Click text in the preview, or add a headline to begin."}</p>{selectedText ? <><div className="motion-grid">{motions.map((motion) => <button key={motion.id} className={`motion-card ${motion.preview}${selectedText.motion.treatment === motion.id ? " selected" : ""}`} disabled={!writable} onClick={() => setMotion(motion.id)}><span className="motion-preview">Aa</span><strong>{motion.name}</strong><small>{motion.note}</small></button>)}</div><div className="motion-tuning"><label>Entry <input type="range" min="0" max="1200" step="50" value={selectedText.motion.entranceUs} onChange={(event) => tune("entranceUs", Number(event.target.value))} /><output>{(selectedText.motion.entranceUs / 1000).toFixed(0)} ms</output></label><label>Word stagger <input type="range" min="0" max="240" step="20" value={selectedText.motion.staggerUs} onChange={(event) => tune("staggerUs", Number(event.target.value))} /><output>{(selectedText.motion.staggerUs / 1000).toFixed(0)} ms</output></label></div></> : <button className="primary-button full-width" disabled={!writable} onClick={() => chooseText("heading")}>Add a headline</button>}</section> : null}
      {tab === "style" ? <AureliusStylePanel project={project} session={session} writable={writable} /> : null}
      {tab === "captions" ? <CaptionStudio project={project} session={session} writable={writable} /> : null}
    </div>
  </aside>;
}
