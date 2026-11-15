import { readFile, readdir, stat } from "node:fs/promises";
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

const publicConfig = await readFile(path.join(output, "supabase-config.js"), "utf8");
if (/suutpjjcendapzpebkcp|sb_publishable_|sb_secret_|service_role/i.test(publicConfig)) {
  throw new Error("The public preview config must not inherit the repository's live Supabase project or credentials.");
}
const configMatch = publicConfig.match(/window\\.YNTYMAK_CONFIG\\s*=\\s*(\\{[\\s\\S]*\\});/);
if (!configMatch) throw new Error("Generated public Supabase config is missing or malformed.");
const previewConfig = JSON.parse(configMatch[1]);
for (const flag of [
  "enableHostedAI",
  "enableCloudInitiatives",
  "enableCloudProjects",
  "enableCloudEvents",
  "enableCloudContent",
  "enableCloudElections",
  "enableAuthCaptcha",
  "enableSelfServiceSignup"
]) {
  if (previewConfig[flag] !== false) {
    throw new Error(`Safe preview default is missing or enabled: ${flag}`);
  }
}
if (previewConfig.supabaseUrl !== "" || previewConfig.supabasePublishableKey !== "") {
  throw new Error("Default public preview must not be connected to any Supabase project.");
}

console.log(`Static publish directory verified (${files.size} approved files; no private docs, SQL, admin files, or live Supabase connection).`);
