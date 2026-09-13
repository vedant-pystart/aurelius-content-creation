import { MediaError, asMediaError } from "./errors";
import { assertSafeBinaryPath } from "./binary-store";
import type { BinaryInput, BinaryStore } from "./types";

type RootProvider = () => Promise<FileSystemDirectoryHandle>;

export class OpfsBinaryStore implements BinaryStore {
  constructor(private readonly rootProvider: RootProvider = async () => {
    if (!navigator.storage?.getDirectory) throw new MediaError("STORAGE_UNAVAILABLE", "This browser does not provide local media storage", "choose-another-file");
    return navigator.storage.getDirectory();
  }) {}

  private async parent(path: string, create: boolean): Promise<{ dir: FileSystemDirectoryHandle; name: string }> {
    const parts = assertSafeBinaryPath(path).split("/");
    const name = parts.pop()!;
    let dir = await this.rootProvider();
    for (const part of parts) dir = await dir.getDirectoryHandle(part, { create });
    return { dir, name };
  }

  async writePartial(path: string, input: BinaryInput, signal?: AbortSignal, onBytes?: (bytes: number) => void): Promise<void> {
    const { dir, name } = await this.parent(path, true);
    const handle = await dir.getFileHandle(name, { create: true });
    const writer = await handle.createWritable();
    const reader = input.stream().getReader();
    let total = 0;
    try {
      while (true) {
        if (signal?.aborted) throw new MediaError("IMPORT_INTERRUPTED", "Import was cancelled", "retry", { stage: "copy" });
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > input.size) throw new MediaError("CORRUPT_INPUT", "Media stream exceeded its declared size", "choose-another-file", { stage: "copy" });
        await writer.write(value.slice().buffer);
        onBytes?.(total);
      }
      if (total !== input.size) throw new MediaError("CORRUPT_INPUT", "Media copy ended early", "choose-another-file", { stage: "copy" });
      await writer.close();
      if ((await handle.getFile()).size !== input.size) throw new MediaError("CORRUPT_INPUT", "Copied media failed verification", "retry", { stage: "copy" });
    } catch (error) {
      try { await writer.abort(); } catch { /* best effort */ }
      try { await dir.removeEntry(name); } catch { /* idempotent */ }
      throw asMediaError(error, "Could not copy media into browser storage");
    } finally { reader.releaseLock(); }
  }

  async write(path: string, bytes: Blob, signal?: AbortSignal): Promise<void> {
    const { dir, name } = await this.parent(path, true);
    const handle = await dir.getFileHandle(name, { create: true });
    const writer = await handle.createWritable();
    try {
      if (signal?.aborted) throw new MediaError("IMPORT_INTERRUPTED", "Import was cancelled", "retry");
      await bytes.stream().pipeTo(writer, signal ? { signal } : undefined);
      if ((await handle.getFile()).size !== bytes.size) throw new MediaError("CORRUPT_INPUT", "Stored derivative failed verification", "retry", { stage: "derive" });
    } catch (error) { try { await writer.abort(); } catch { /* best effort */ } throw asMediaError(error, "Could not store media derivative"); }
  }

  async promote(partialPath: string, finalPath: string, expectedBytes: number): Promise<void> {
    const source = await this.read(partialPath);
    if (source.size !== expectedBytes) throw new MediaError("CORRUPT_INPUT", "Staged media failed verification", "retry", { stage: "promote" });
    const { dir, name } = await this.parent(finalPath, true);
    const handle = await dir.getFileHandle(name, { create: true });
    const writer = await handle.createWritable();
    try {
      await source.stream().pipeTo(writer);
      if ((await handle.getFile()).size !== expectedBytes) throw new MediaError("CORRUPT_INPUT", "Final media failed verification", "retry", { stage: "promote" });
      await this.delete(partialPath);
    } catch (error) {
      try { await writer.abort(); } catch { /* best effort */ }
      try { await dir.removeEntry(name); } catch { /* best effort */ }
      throw asMediaError(error, "Could not finish storing media");
    }
  }
  async read(path: string): Promise<Blob> {
    try { const { dir, name } = await this.parent(path, false); return await (await dir.getFileHandle(name)).getFile(); }
    catch (error) { throw new MediaError("MISSING_SOURCE", "Local source media is missing", "relink-source", { stage: "read" }, error); }
  }
  async exists(path: string): Promise<boolean> { try { await this.read(path); return true; } catch { return false; } }
  async size(path: string): Promise<number | null> { try { return (await this.read(path)).size; } catch { return null; } }
  async delete(path: string): Promise<void> { try { const { dir, name } = await this.parent(path, false); await dir.removeEntry(name); } catch (error) { if (!(error instanceof DOMException && error.name === "NotFoundError")) throw error; } }
  async listPartials(): Promise<readonly string[]> {
    try {
      let dir = await this.rootProvider();
      dir = await dir.getDirectoryHandle("aurelius"); dir = await dir.getDirectoryHandle("imports");
      const paths: string[] = [];
      for await (const [name, handle] of dir.entries()) if (handle.kind === "file" && name.endsWith(".partial")) paths.push(`aurelius/imports/${name}`);
      return paths.sort();
    } catch { return []; }
  }
  async cleanupPartials(): Promise<number> { const paths = await this.listPartials(); for (const path of paths) await this.delete(path); return paths.length; }
}
