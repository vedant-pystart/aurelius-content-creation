import { applyPatches, enablePatches, produceWithPatches } from "immer";
import { ProjectModelError, asProjectModelError } from "../errors";
import type { ProjectDoc } from "../model";
import { assertValidProjectDoc } from "../validation";
import type { CommandExecutionContext, CommandResult, CommandTransaction, EditorCommand } from "./contracts";
import { registeredHandler } from "./foundational";

enablePatches();

const commandTypes = new Set(["project/rename", "composition/setBackground", "composition/setFormat", "asset/register", "asset/rename", "asset/replaceMetadata", "asset/remove", "clip/add", "clip/remove", "clip/setTiming", "clip/setTransform", "clip/setCrop", "clip/setLayer", "text/setContent", "text/add", "text/setMotion", "timeline/move", "timeline/trim", "timeline/split", "timeline/duplicate", "timeline/reorderLayer", "timeline/delete", "timeline/rippleDelete", "caption/add", "caption/setTiming", "caption/update", "caption/replaceAll", "caption/setSettings", "audio/add", "audio/addSourceFromVideo", "audio/setMix", "audio/replaceAsset", "template/compile", "aurelius/applyStyle", "aurelius/applyPacing", "transition/add", "transition/update", "transition/remove"]);

function reject(message: string, details: Readonly<Record<string, unknown>> = {}): never {
  throw new ProjectModelError("COMMAND_REJECTED", message, "revise-edit", details);
}

function assertIso(value: string): void {
  if (!Number.isFinite(Date.parse(value))) reject("Command commit timestamp must be a valid ISO timestamp");
}

export function executeCommand(baseInput: ProjectDoc, command: EditorCommand, context: CommandExecutionContext): CommandResult {
  const base = assertValidProjectDoc(baseInput);
  if (!command || typeof command !== "object" || !("type" in command) || !commandTypes.has(command.type)) reject("Unknown editor command");
  if (command.expectedRevision !== base.revision) {
    throw new ProjectModelError("STALE_REVISION", `Expected revision ${command.expectedRevision}, but project is at ${base.revision}`, "reload-latest-project", { expectedRevision: command.expectedRevision, actualRevision: base.revision });
  }
  assertIso(context.committedAtIso);
  try {
    const [candidate, forwardPatches, inversePatches] = produceWithPatches(base, (draft) => {
      registeredHandler(command).apply(draft, command);
      draft.revision = base.revision + 1;
      draft.updatedAt = context.committedAtIso;
    });
    const nextDoc = assertValidProjectDoc(candidate);
    const transaction: CommandTransaction = {
      label: registeredHandler(command).label(command), baseRevision: base.revision, nextRevision: nextDoc.revision,
      command, forwardPatches, inversePatches,
      estimatedBytes: JSON.stringify({ command, forwardPatches, inversePatches }).length,
    };
    return { nextDoc, transaction };
  } catch (error) {
    const domainError = asProjectModelError(error);
    if (domainError.code === "COMMAND_REJECTED" || domainError.code === "STALE_REVISION") throw domainError;
    throw new ProjectModelError("COMMAND_REJECTED", `Command would create invalid project state: ${domainError.message}`, "revise-edit", { commandType: command.type, causeCode: domainError.code }, domainError.issues);
  }
}

function verifyRevision(doc: ProjectDoc, expected: number, direction: "forward" | "inverse"): void {
  if (doc.revision !== expected) reject(`Cannot apply ${direction} patches at revision ${doc.revision}`, { expectedRevision: expected, actualRevision: doc.revision });
}

export function applyTransactionForward(baseInput: ProjectDoc, transaction: CommandTransaction): ProjectDoc {
  const base = assertValidProjectDoc(baseInput);
  verifyRevision(base, transaction.baseRevision, "forward");
  const result = assertValidProjectDoc(applyPatches(base, transaction.forwardPatches));
  if (result.revision !== transaction.nextRevision) reject("Forward patches produced the wrong revision");
  return result;
}

export function applyTransactionInverse(nextInput: ProjectDoc, transaction: CommandTransaction): ProjectDoc {
  const next = assertValidProjectDoc(nextInput);
  verifyRevision(next, transaction.nextRevision, "inverse");
  const result = assertValidProjectDoc(applyPatches(next, transaction.inversePatches));
  if (result.revision !== transaction.baseRevision) reject("Inverse patches produced the wrong revision");
  return result;
}
