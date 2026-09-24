import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";

const libraryModule = "virtual:aurelius-asset-library", resolvedLibraryModule = `\0${libraryModule}`;
const supportedAssets = new Set([".avif", ".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp"]);
const discoverAssets = (directory: string, root = directory): { name: string; url: string }[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name);
  if (entry.isDirectory()) return discoverAssets(path, root);
  const extension = entry.name.slice(entry.name.lastIndexOf(".")).toLowerCase();
  return supportedAssets.has(extension) ? [{ name: entry.name, url: `/assets/${relative(root, path).split("\\").join("/").split("/").map(encodeURIComponent).join("/")}` }] : [];
});
const assetLibrary = () => ({ name: "aurelius-asset-library", resolveId(id: string) { return id === libraryModule ? resolvedLibraryModule : undefined; }, load(id: string) { return id === resolvedLibraryModule ? `export default ${JSON.stringify(discoverAssets(join(process.cwd(), "public/assets")))};` : undefined; } });

export default defineConfig({ plugins: [react(), assetLibrary()] });
