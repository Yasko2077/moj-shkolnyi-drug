import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildScript = path.join(root, "scripts", "build-static.mjs");
const outputConfig = path.join(root, "dist", "supabase-config.js");
const variableNames = [
  "YNTYMAK_SUPABASE_URL",
  "YNTYMAK_SUPABASE_PUBLISHABLE_KEY",
  "YNTYMAK_ENABLE_AUTH_CAPTCHA",
  "YNTYMAK_ENABLE_SELF_SERVICE_SIGNUP",
  "YNTYMAK_TURNSTILE_SITE_KEY"
];

function runBuild(label, values, shouldPass, expectedError) {
  const env = { ...process.env };
  for (const key of variableNames) delete env[key];
  Object.assign(env, values);
  const result = spawnSync(process.execPath, [buildScript], {
    cwd: root,
    env,
    encoding: "utf8"
  });
  const combined = (result.stdout || "") + (result.stderr || "");
  if (shouldPass && result.status !== 0) {
    throw new Error(`${label}: expected build success, received ${result.status}: ${combined}`);
  }
  if (!shouldPass && result.status === 0) {
    throw new Error(`${label}: expected the build to reject unsafe configuration.`);
  }
  if (!shouldPass && expectedError && !combined.includes(expectedError)) {
    throw new Error(`${label}: expected error containing "${expectedError}", got: ${combined}`);
  }
  return combined;
}

async function readConfig() {
  const source = await readFile(outputConfig, "utf8");
  const marker = "window.YNTYMAK_CONFIG = ";
  const start = source.indexOf(marker);
  const jsonStart = start < 0 ? -1 : source.indexOf("{", start);
  const end = source.lastIndexOf("};");
  if (jsonStart < 0 || end < jsonStart) throw new Error("Generated browser config is malformed.");
  return JSON.parse(source.slice(jsonStart, end + 1));
}

try {
  runBuild("default demo build", {}, true);
  const demo = await readConfig();
  if (demo.supabaseUrl !== "" || demo.supabasePublishableKey !== "") {
    throw new Error("Default demo build unexpectedly has a Supabase backend.");
  }
  for (const name of ["enableHostedAI", "enableCloudInitiatives", "enableCloudProjects",
    "enableCloudEvents", "enableCloudContent", "enableCloudElections",
    "enableAuthCaptcha", "enableSelfServiceSignup"]) {
    if (demo[name] !== false) throw new Error(`Default demo build unexpectedly enabled ${name}.`);
  }

  runBuild("URL without key", {
    YNTYMAK_SUPABASE_URL: "https://stage-project.supabase.co"
  }, false, "Set both YNTYMAK_SUPABASE_URL");

  runBuild("known live project", {
    YNTYMAK_SUPABASE_URL: "https://suutpjjcendapzpebkcp.supabase.co",
    YNTYMAK_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_only"
  }, false, "refuses to connect to the existing live Supabase project");

  runBuild("self-service without CAPTCHA", {
    YNTYMAK_ENABLE_SELF_SERVICE_SIGNUP: "true"
  }, false, "cannot be enabled without Auth CAPTCHA");

  runBuild("CAPTCHA without a site key", {
    YNTYMAK_SUPABASE_URL: "https://stage-project.supabase.co",
    YNTYMAK_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_only",
    YNTYMAK_ENABLE_AUTH_CAPTCHA: "true"
  }, false, "YNTYMAK_TURNSTILE_SITE_KEY is required");

  runBuild("staging Auth with CAPTCHA", {
    YNTYMAK_SUPABASE_URL: "https://stage-project.supabase.co",
    YNTYMAK_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_only",
    YNTYMAK_ENABLE_AUTH_CAPTCHA: "true",
    YNTYMAK_TURNSTILE_SITE_KEY: "test-turnstile-site-key"
  }, true);
  const staging = await readConfig();
  if (staging.supabaseUrl !== "https://stage-project.supabase.co" ||
      staging.enableAuthCaptcha !== true ||
      staging.enableSelfServiceSignup !== false ||
      staging.enableCloudInitiatives !== false) {
    throw new Error("Staging Auth configuration did not retain the intended safe defaults.");
  }

  runBuild("staging public signup", {
    YNTYMAK_SUPABASE_URL: "https://stage-project.supabase.co",
    YNTYMAK_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_only",
    YNTYMAK_ENABLE_AUTH_CAPTCHA: "true",
    YNTYMAK_ENABLE_SELF_SERVICE_SIGNUP: "true",
    YNTYMAK_TURNSTILE_SITE_KEY: "test-turnstile-site-key"
  }, true);
  const openSignup = await readConfig();
  if (openSignup.enableSelfServiceSignup !== true || openSignup.enableAuthCaptcha !== true) {
    throw new Error("Explicit staging self-service signup configuration was not applied.");
  }

  console.log("Static build environment tests passed (safe default, staging allow-list, and unsafe config rejection).");
} finally {
  // Leave the Render publish directory in the disconnected demo state.
  runBuild("restore default demo publish output", {}, true);
}
