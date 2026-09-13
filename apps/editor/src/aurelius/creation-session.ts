import { compileAureliusTemplate, planAureliusPacing, styleForProject, type AureliusPacing, type AureliusStyleId, type TemplateInput } from "@aurelius/composition";
import type { Motion } from "@aurelius/project-model";
import type { TimelineSession } from "../timeline/timeline-session";

/** Keeps only ephemeral form state outside the project; all accepted work goes through TimelineSession. */
export class AureliusCreationSession {
  constructor(private readonly timeline: TimelineSession) {}
  compile(input: TemplateInput): boolean { return this.timeline.commit(compileAureliusTemplate(this.timeline.snapshot.project, input)); }
  pace(mode: AureliusPacing): boolean { return this.timeline.commit(planAureliusPacing(this.timeline.snapshot.project, mode)); }
  applyStyle(style: AureliusStyleId): boolean {
    const project = this.timeline.snapshot.project; const first = project.textStyleOrder[0]; if (!first) return false;
    const updates = [{ ...styleForProject(project, style, first), id: first }]; const treatment: Motion["treatment"] = style === "cinema" ? "film-title-fade" : style === "impact" ? "impact-slam" : style === "reel-captions" ? "word-cascade" : style === "quote" ? "masked-reveal" : "editorial-rise"; const clipUpdates = Object.values(project.clips).filter((clip) => clip.kind === "text").map((clip) => ({ id: clip.id, textStyleId: first, motion: { ...clip.motion, treatment } }));
    return this.timeline.commit({ type: "aurelius/applyStyle", expectedRevision: project.revision, textStyleUpdates: updates, clipUpdates });
  }
}
