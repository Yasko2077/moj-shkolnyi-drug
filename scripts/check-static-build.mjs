import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const output = path.resolve("dist");
const allowed = new Set([
  "index.html", "styles.css", "app.js", "cloud.js", "supabase-config.js",
  "manifest.webmanifest", "service-worker.js", "offline.html", "favicon.svg", "robots.txt"
]);
const required = new Set(["index.html", "app.js", "styles.css", "cloud.js", "supabase-config.js"]);
const names = await readdir(output);
const files = new Set(names);

for (const name of required) {
  if (!files.has(name)) throw new Error(`Public build is missing ${name}`);
}
for (const name of files) {
  if (!allowed.has(name)) throw new Error(`Unexpected file in public build: ${name}`);
  const info = await stat(path.join(output, name));
  if (!info.isFile()) throw new Error(`Unexpected non-file asset in dist/: ${name}`);
}
for (const forbidden of ["README.md", "docs", "supabase", "ADMIN_SETUP.txt", "AI_SYSTEM_PROMPT.md"]) {
  if (files.has(forbidden)) throw new Error(`Private project material leaked into dist/: ${forbidden}`);
}

console.log(`Static publish directory verified (${files.size} approved files; no internal SQL/docs/admin files).`);
