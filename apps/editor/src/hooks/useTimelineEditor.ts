import { useEffect, useMemo, useState } from "react";
import type { AutosaveCoordinator } from "@aurelius/media";
import type { ProjectDoc } from "@aurelius/project-model";
import { TimelineSession, type TimelineSnapshot } from "../timeline/timeline-session";

export function useTimelineEditor(project: ProjectDoc, autosave: AutosaveCoordinator | null, writable: boolean) {
  const session = useMemo(() => new TimelineSession(project, autosave, () => writable), [project.id, autosave, writable]);
  const [snapshot, setSnapshot] = useState<TimelineSnapshot>(session.snapshot);
  useEffect(() => { const off = session.subscribe(setSnapshot); return () => { off(); session.dispose(); }; }, [session]);
  return { session, snapshot };
}
