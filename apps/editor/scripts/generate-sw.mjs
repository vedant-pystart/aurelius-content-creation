import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

const dist = new URL("../dist/", import.meta.url);
const filePath = (url) => url.pathname;
const basePath = (process.env.VITE_BASE_PATH ?? "/").replace(/^([^/])/, "/$1").replace(/([^/])$/, "$1/");
async function files(directory) {
  const entries = await readdir(filePath(directory), { withFileTypes: true });
  const result = [];
  for (const entry of entries) { const url = new URL(entry.name, directory); if (entry.isDirectory()) result.push(...await files(new URL(`${entry.name}/`, directory))); else result.push(url); }
  return result;
}
const staticFiles = (await files(dist)).filter((url) => /\.(?:js|css|woff2|svg|webmanifest|png)$/.test(url.pathname)).map((url) => `${basePath}${relative(filePath(dist), filePath(url)).replaceAll("\\", "/")}`);
const revision = (await readFile(new URL("index.html", dist), "utf8")).match(/src="([^"]+)"/)?.[1] ?? "shell";
const source = `const CACHE="aurelius-shell-${revision.replace(/[^a-z0-9]/gi, "")}";const ASSETS=${JSON.stringify([basePath, `${basePath}index.html`, ...staticFiles])};self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("aurelius-shell-")&&k!==CACHE).map(k=>caches.delete(k))))));self.addEventListener("message",e=>{if(e.data?.type==="SKIP_WAITING")self.skipWaiting()});self.addEventListener("fetch",e=>{const u=new URL(e.request.url);if(u.origin!==location.origin||e.request.method!=="GET"||u.pathname.includes("/exports/")||u.pathname.includes("/assets/")&&u.search||e.request.headers.has("range"))return;if(e.request.mode==="navigate"){e.respondWith(caches.match("${basePath}index.html").then(r=>r||fetch(e.request)));return}if(ASSETS.includes(u.pathname))e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)))});`;
await writeFile(new URL("sw.js", dist), source);
