import { useState } from "react";
import type { ProjectSummary } from "@aurelius/project-model";

export function ProjectCard({project,onOpen,onRename,onDuplicate,onDelete}:{project:ProjectSummary;onOpen():void;onRename(title:string):Promise<void>;onDuplicate():Promise<void>;onDelete():Promise<void>}){
 const [editing,setEditing]=useState(false);const [title,setTitle]=useState(project.title);const [confirming,setConfirming]=useState(false);const [busy,setBusy]=useState(false);
 const act=async(fn:()=>Promise<void>)=>{setBusy(true);try{await fn();}finally{setBusy(false)}};
 return <article className="project-card" data-testid="project-card">
  <button className="project-open" onClick={onOpen} aria-label={`Open ${project.title}`}><span className="project-format">9:16 · {project.revision===0?"New":`Revision ${project.revision}`}</span><strong>{project.title}</strong><span>{new Date(project.updatedAt).toLocaleString()}</span></button>
  {editing?<form className="inline-form" onSubmit={(e)=>{e.preventDefault();void act(async()=>{await onRename(title);setEditing(false)})}}><label>Project name<input autoFocus value={title} onChange={(e)=>setTitle(e.target.value)} /></label><button disabled={busy}>Save</button><button type="button" onClick={()=>{setTitle(project.title);setEditing(false)}}>Cancel</button></form>:null}
  <div className="card-actions"><button onClick={()=>setEditing(true)}>Rename</button><button disabled={busy} onClick={()=>void act(onDuplicate)}>Duplicate</button><button className="danger-link" onClick={()=>setConfirming(true)}>Delete</button></div>
  {confirming?<div className="confirm-row" role="alert"><span>Delete “{project.title}”? Media shared by other projects stays safe.</span><button disabled={busy} onClick={()=>void act(onDelete)}>Delete project</button><button onClick={()=>setConfirming(false)}>Keep it</button></div>:null}
 </article>;
}
