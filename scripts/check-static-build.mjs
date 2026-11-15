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
if (/suutpjjcendapzpebkcp|sb_secret_|service_role/i.test(publicConfig)) {
  throw new Error("The public preview config must not contain the live Supabase project or private credentials.");
}
const assignmentMarker = "window.YNTYMAK_CONFIG = ";
const assignmentStart = publicConfig.indexOf(assignmentMarker);
const jsonStart = assignmentStart < 0 ? -1 : publicConfig.indexOf("{", assignmentStart);
const jsonEnd = publicConfig.lastIndexOf("};");
if (jsonStart < 0 || jsonEnd < jsonStart) {
  throw new Error("Generated public Supabase config is missing or malformed.");
}
const previewConfig = JSON.parse(publicConfig.slice(jsonStart, jsonEnd + 1));
if (previewConfig.supabaseUrl && !/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(previewConfig.supabaseUrl)) {
  throw new Error("Public config contains an invalid staging Supabase URL.");
}
if (previewConfig.supabaseUrl && previewConfig.supabaseUrl.startsWith("https://suutpjjcendapzpebkcp.")) {
  throw new Error("Public config must never use the live Supabase project.");
}
if (previewConfig.supabasePublishableKey && !previewConfig.supabasePublishableKey.startsWith("sb_publishable_")) {
  throw new Error("Public config may contain only a Supabase publishable key.");
}
const cloudFlags = ["enableCloudInitiatives","enableCloudProjects","enableCloudEvents","enableCloudContent"];
if (cloudFlags.some(flag => previewConfig[flag] === true) &&
    (!previewConfig.supabaseUrl || !previewConfig.supabasePublishableKey)) {
  throw new Error("Cloud modules cannot be enabled without an isolated staging backend.");
}
if (previewConfig.enableCloudElections === true) {
  throw new Error("Online elections must remain disabled in the public staging build.");
}
for (const flag of [
  "enableHostedAI",
  "enableCloudElections",
  "enableAuthCaptcha",
  "enableSelfServiceSignup"
]) {
  if (previewConfig[flag] !== false) {
    throw new Error(`Safe preview default is missing or enabled: ${flag}`);
  }
}
if (previewConfig.enableSelfServiceSignup === true && previewConfig.enableAuthCaptcha !== true) {
  throw new Error("Public self-service signup requires Auth CAPTCHA.");
}
if (previewConfig.supabaseUrl === "" && previewConfig.supabasePublishableKey === "" &&
    cloudFlags.some(flag => previewConfig[flag] === true)) {
  throw new Error("Disconnected demo build must not enable cloud modules.");
}

console.log(`Static publish directory verified (${files.size} approved files; no private docs, SQL, admin files, or live Supabase connection).`);
