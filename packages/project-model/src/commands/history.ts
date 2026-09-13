import type { ProjectDoc } from "../model";
import { applyTransactionForward, applyTransactionInverse } from "./execute";
import type { CommandTransaction } from "./contracts";

/** Exact reversible project history; edits are immutable transactions, never ad-hoc patches. */
export class EditorHistory {
  private undoStack: CommandTransaction[] = [];
  private redoStack: CommandTransaction[] = [];
  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }
  get undoLabel(): string | undefined { return this.undoStack.at(-1)?.label; }
  get redoLabel(): string | undefined { return this.redoStack.at(-1)?.label; }
  record(transaction: CommandTransaction): void { this.undoStack.push(transaction); if (this.undoStack.length > 100) this.undoStack.splice(0, this.undoStack.length - 100); this.redoStack = []; }
  undo(doc: ProjectDoc): { doc: ProjectDoc; transaction: CommandTransaction } | undefined { const transaction = this.undoStack.pop(); if (!transaction) return undefined; const next = applyTransactionInverse(doc, transaction); this.redoStack.push(transaction); return { doc: next, transaction }; }
  redo(doc: ProjectDoc): { doc: ProjectDoc; transaction: CommandTransaction } | undefined { const transaction = this.redoStack.pop(); if (!transaction) return undefined; const next = applyTransactionForward(doc, transaction); this.undoStack.push(transaction); return { doc: next, transaction }; }
  clear(): void { this.undoStack = []; this.redoStack = []; }
}
