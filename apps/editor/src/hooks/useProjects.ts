import { useCallback, useEffect, useState } from "react";
import type { ProjectSummary } from "@aurelius/project-model";
import type { AppRuntime } from "../runtime";

export function useProjects(runtime: AppRuntime) {
  const [projects,setProjects]=useState<readonly ProjectSummary[]>([]); const [status,setStatus]=useState<"loading"|"ready"|"error">("loading"); const [error,setError]=useState<Error|null>(null);
  const refresh=useCallback(async()=>{setStatus("loading");try{setProjects(await runtime.projectService.list());setError(null);setStatus("ready");}catch(cause){setError(cause instanceof Error?cause:new Error("Could not load projects"));setStatus("error");}},[runtime]);
  useEffect(()=>{void refresh();},[refresh]);
  const run=useCallback(async(action:()=>Promise<unknown>)=>{await action();await refresh();},[refresh]);
  return {projects,status,error,refresh,create:(title:string,height:1920|1350|1080,fps:24|30|60)=>run(()=>runtime.projectService.create({title,height,frameRate:{numerator:fps,denominator:1}})),rename:(id:string,title:string)=>run(()=>runtime.projectService.rename(id,title)),duplicate:(id:string)=>run(()=>runtime.projectService.duplicate(id)),remove:(id:string)=>run(()=>runtime.projectService.delete(id))};
}
