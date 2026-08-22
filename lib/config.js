/* ============================================================
   ANBU BLACK OPS — Remote database defaults (Supabase)
   ------------------------------------------------------------
   The key below is a SUPABASE PUBLISHABLE key ("sb_publishable_…").
   Publishable keys are PUBLIC BY DESIGN (they ship inside every
   browser app) — it is safe for them to live in this repo.
   NEVER put the secret service_role key here.

   These defaults are active EVERYWHERE — localhost, Vercel, Render,
   the online preview — so every visitor reads and writes the SAME
   database. That is what makes profile photos, report images, APK
   uploads and news posts instantly visible to everyone using the
   site. Export SUPABASE_URL / SUPABASE_KEY in your environment to
   point the app at a different Supabase project.
   ============================================================ */

/* Load <project-root>/.env into process.env at startup so the app
   can be pointed at a different Supabase project without committing
   credentials to git. Real environment variables always win. */
(function loadDotEnv() {
  const fs = require("fs");
  const path = require("path");
  const envFile = path.join(__dirname, "..", ".env");
  let raw;
  try {
    raw = fs.readFileSync(envFile, "utf8");
  } catch (e) {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
})();

const PLATFORM_DEPLOYED =
  !!(
    process.env.VERCEL ||
    process.env.RENDER ||
    process.env.RENDER_EXTERNAL_URL ||
    process.env.RAILWAY_ENVIRONMENT ||
    process.env.FLY_APP_NAME ||
    process.env.DYNO /* heroku */
  );

module.exports = {
  PLATFORM_DEPLOYED,
  SUPABASE_URL:
    process.env.SUPABASE_URL || "https://mdjunotrttklmsgkrkwd.supabase.co",
  SUPABASE_KEY:
    process.env.SUPABASE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    "sb_publishable_JctVpoYc-Kdoo6trbhuIGg_T-uvXr2k",
};
