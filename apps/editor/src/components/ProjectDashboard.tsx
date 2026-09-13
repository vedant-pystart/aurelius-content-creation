import { useState } from "react";
import type { AppRuntime } from "../runtime";
import { useProjects } from "../hooks/useProjects";
import { ProjectCard } from "./ProjectCard";
import "./project-dashboard.css";

export function ProjectDashboard({runtime,onOpen}:{runtime:AppRuntime;onOpen(id:string):void}){
 const api=useProjects(runtime);const [title,setTitle]=useState("");const [height,setHeight]=useState<1920|1350|1080>(1920);const [fps,setFps]=useState<24|30|60>(30);const [creating,setCreating]=useState(false);
 return <main className="dashboard-shell">
  <header className="dashboard-header"><div><p className="eyebrow">Aurelius</p><h1>Video Studio</h1><p>Your local library for films worth keeping.</p></div><div className="local-badge"><span/>Local-first<br/><small>Nothing uploads</small></div></header>
  <section className="new-project" aria-labelledby="new-project-title"><div><p className="kicker">Begin a film</p><h2 id="new-project-title">New project</h2></div><form onSubmit={(e)=>{e.preventDefault();setCreating(true);void api.create(title||"Untitled Aurelius Film",height,fps).then(()=>setTitle("")).finally(()=>setCreating(false))}}><label>Project name<input value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="A thought worth sharing"/></label><label>Format<select value={height} onChange={(e)=>setHeight(Number(e.target.value) as typeof height)}><option value={1920}>9:16 Reel</option><option value={1350}>4:5 Portrait</option><option value={1080}>1:1 Square</option></select></label><label>Frame rate<select value={fps} onChange={(e)=>setFps(Number(e.target.value) as typeof fps)}><option value={24}>24 fps</option><option value={30}>30 fps</option><option value={60}>60 fps</option></select></label><button className="primary-button" disabled={creating}>{creating?"Creating…":"Create project"}</button></form></section>
  <section className="project-list" aria-labelledby="recent-title"><div className="section-heading"><div><p className="kicker">Saved on this device</p><h2 id="recent-title">Recent projects</h2></div><span>{api.projects.length} {api.projects.length===1?"project":"projects"}</span></div>
   {api.status==="loading"?<p role="status" className="empty-state">Opening your local library…</p>:null}
   {api.status==="error"?<div className="error-state" role="alert"><strong>Your projects are still on this device.</strong><p>{api.error?.message}</p><button onClick={()=>void api.refresh()}>Retry</button></div>:null}
   {api.status==="ready"&&api.projects.length===0?<div className="empty-state"><strong>No films yet.</strong><p>Name the first one above. It autosaves here as you work.</p></div>:null}
   <div className="project-grid">{api.projects.map((project)=><ProjectCard key={project.id} project={project} onOpen={()=>onOpen(project.id)} onRename={(name)=>api.rename(project.id,name)} onDuplicate={()=>api.duplicate(project.id)} onDelete={()=>api.remove(project.id)}/>)}</div>
  </section>
 </main>;
}
