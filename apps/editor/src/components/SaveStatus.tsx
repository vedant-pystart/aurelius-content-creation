import type { AutosaveState, OwnershipStatus } from "@aurelius/media";

export function SaveStatus({save,ownership,onRetry,onRestore}:{save:AutosaveState|null;ownership:OwnershipStatus;onRetry():void;onRestore():void}){
 if(!ownership.writable)return <div className="save-status read-only" role="status" aria-live="polite"><strong>Read only</strong><span>This project is open for editing in another tab.</span></div>;
 if(ownership.reducedProtection)return <div className="save-status caution" role="status" aria-live="polite"><strong>Saved locally · single-tab recommended</strong><span>This browser cannot coordinate editing tabs.</span></div>;
 if(!save)return <div className="save-status" role="status" aria-live="polite">Opening…</div>;
 if(save.status==="saving")return <div className="save-status saving" role="status" aria-live="polite"><strong>Saving…</strong><span>Revision {save.revision}</span></div>;
 if(save.status==="saved")return <div className="save-status saved" role="status" aria-live="polite"><strong>Saved locally</strong><span>Revision {save.revision}</span></div>;
 if(save.status==="error")return <div className="save-status error" role="alert"><strong>Couldn’t save</strong><span>{save.error.message}</span><button onClick={onRetry}>Retry</button><button onClick={onRestore}>Restore last saved</button></div>;
 if(save.status==="recovery")return <div className="save-status error" role="alert"><strong>Reload needed</strong><span>{save.error.message}</span><button onClick={onRestore}>Reload latest</button></div>;
 return <div className="save-status" role="status" aria-live="polite">Ready · Revision {save.revision}</div>;
}
