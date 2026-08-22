/* ============================================================
   ANBU BLACK OPS — Vercel serverless entry
   ------------------------------------------------------------
   Deploying this repo to Vercel serves the static site from the
   root and routes every /api/* request to this function.

   To make data persist on Vercel:
     1. Create a KV store (Storage -> KV) in your Vercel project.
     2. Link it — Vercel injects KV_REST_API_URL / KV_REST_API_TOKEN.
     3. Redeploy. The same API code then stores to Redis instead
        of the local JSON file.
   ============================================================ */

const { createApp } = require("../lib/app");

module.exports = createApp();
