import { cp, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist");

// This is an explicit public allow-list. Never copy the repository root wholesale:
// SQL migrations, internal runbooks and admin provisioning templates must stay private.
const publicFiles = [
  "index.html",
  "styles.css",
  "app.js",
  "cloud.js",
  "supabase-config.js",
  "manifest.webmanifest",
  "service-worker.js",
  "offline.html",
  "favicon.svg",
  "robots.txt"
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const relativePath of publicFiles) {
  const source = path.join(root, relativePath);
  const destination = path.join(output, relativePath);
  const details = await stat(source).catch(() => null);
  if (!details?.isFile()) {
    throw new Error(`Required public asset is missing: ${relativePath}`);
  }
  await cp(source, destination);
}

console.log(`Static site built in dist/ (${publicFiles.length} allow-listed files).`);
