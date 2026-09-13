import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const lock = JSON.parse(await readFile(resolve(root, "fixtures.lock.json"), "utf8"));
const verifyOnly = process.argv.includes("--verify");
for (const fixture of lock.fixtures) {
  const target = resolve(root, fixture.path);
  let bytes;
  try { bytes = await readFile(target); }
  catch { if (verifyOnly) throw new Error(`Missing fixture: ${fixture.path}`); }
  if (!bytes) {
    const response = await fetch(fixture.url); if (!response.ok) throw new Error(`Fetch failed (${response.status}): ${fixture.path}`);
    bytes = Buffer.from(await response.arrayBuffer()); await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes);
  }
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (bytes.length !== fixture.bytes || hash !== fixture.sha256) throw new Error(`Fixture verification failed: ${fixture.path}`);
  process.stdout.write(`verified ${fixture.path}\n`);
}
