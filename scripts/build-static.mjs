import { cp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist");
const truthy = value => String(value || "").toLowerCase() === "true";

// Published previews must never inherit the repository's live Supabase project.
// A staging backend can only be injected deliberately through Render build env vars.
const supabaseUrl = String(process.env.YNTYMAK_SUPABASE_URL || "").trim();
const publishableKey = String(process.env.YNTYMAK_SUPABASE_PUBLISHABLE_KEY || "").trim();
const liveProjectRef = "suutpjjcendapzpebkcp";
if (Boolean(supabaseUrl) !== Boolean(publishableKey)) {
  throw new Error("Set both YNTYMAK_SUPABASE_URL and YNTYMAK_SUPABASE_PUBLISHABLE_KEY, or leave both empty.");
}
if (supabaseUrl) {
  let parsed;
  try { parsed = new URL(supabaseUrl); } catch { throw new Error("YNTYMAK_SUPABASE_URL must be a valid HTTPS URL."); }
  if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".supabase.co")) {
    throw new Error("Only an HTTPS Supabase project URL is accepted for a staging preview.");
  }
  if (parsed.hostname.startsWith(liveProjectRef + ".")) {
    throw new Error("The public preview build refuses to connect to the existing live Supabase project. Create a separate staging project.");
  }
  if (!publishableKey.startsWith("sb_publishable_")) {
    throw new Error("Use a Supabase publishable key for the public preview; never use service_role or secret keys.");
  }
}

const enableAuthCaptcha = truthy(process.env.YNTYMAK_ENABLE_AUTH_CAPTCHA);
const requestSelfServiceSignup = truthy(process.env.YNTYMAK_ENABLE_SELF_SERVICE_SIGNUP);
const turnstileSiteKey = String(process.env.YNTYMAK_TURNSTILE_SITE_KEY || "").trim();
if (enableAuthCaptcha && (!supabaseUrl || !publishableKey || !turnstileSiteKey)) {
  throw new Error("Auth CAPTCHA requires a separate staging Supabase project and YNTYMAK_TURNSTILE_SITE_KEY.");
}
if (requestSelfServiceSignup && !enableAuthCaptcha) {
  throw new Error("Self-service signup cannot be enabled without Auth CAPTCHA.");
}
const enableSelfServiceSignup = enableAuthCaptcha && requestSelfServiceSignup;
const enableCloudModules = truthy(process.env.YNTYMAK_ENABLE_CLOUD_MODULES);
if (enableCloudModules && (!supabaseUrl || !publishableKey)) {
  throw new Error("Cloud modules require a separate staging Supabase project and publishable key.");
}

const browserConfig = {
  supabaseUrl,
  supabasePublishableKey: publishableKey,
  enableHostedAI: false,
  enableCloudInitiatives: enableCloudModules,
  enableCloudProjects: enableCloudModules,
  enableCloudEvents: enableCloudModules,
  enableCloudContent: enableCloudModules,
  // Election data is staged but online voting stays disabled pending a separate governance and privacy review.
  enableCloudElections: false,
  enableAuthCaptcha,
  enableSelfServiceSignup,
  turnstileSiteKey
};

// This is an explicit public allow-list. Never copy the repository root wholesale:
// SQL migrations, internal runbooks and admin provisioning templates must stay private.
const publicFiles = [
  "index.html",
  "styles.css",
  "app.js",
  "cloud.js",
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

await writeFile(
  path.join(output, "supabase-config.js"),
  "/* Generated public preview config. No private server keys belong here. */" + String.fromCharCode(10) +
    "window.YNTYMAK_CONFIG = " + JSON.stringify(browserConfig, null, 2) + ";" + String.fromCharCode(10),
  "utf8"
);

console.log(`Static site built in dist/ (${publicFiles.length + 1} allow-listed files).`);
console.log(supabaseUrl ? "Preview backend: separate Supabase staging project." : "Preview backend: disconnected demo mode (safe default).");
console.log(enableCloudModules ? "Cloud modules: enabled for isolated staging." : "Cloud modules: disabled.");
