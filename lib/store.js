/* ============================================================
   ANBU BLACK OPS — Persistence layer
   ------------------------------------------------------------
   Three backends behind one async interface:

   1. SUPABASE (recommended for deployments)
      Used when SUPABASE_URL and SUPABASE_KEY env vars are set.
      Stores every record as one row of a single jsonb key/value
      table (anbu_store) through the PostgREST API. Works on any
      host — Vercel, Render, local.

   2. VERCEL KV / Upstash Redis
      Used when KV_REST_API_URL and KV_REST_API_TOKEN are set.
      Data is split into small keys so every value stays well
      under the value limit.

   3. FILE (default, used locally)
      Stores everything in data/db.json. Every operation works
      straight off disk with atomic writes — safe against stale
      caches wiping uploaded images or APKs.

   Everything exposed below is async.
   ============================================================ */

const fs = require("fs");
const path = require("path");

const { hashPassword, verifyPassword } = require("./passwords");
const { fetchLike } = require("./http");
const {
  SUPABASE_URL: CFG_SUPA_URL,
  SUPABASE_KEY: CFG_SUPA_KEY,
} = require("./config");

/* ---------------- backend detection ---------------- */
const USE_KV = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

const SUPABASE_URL = String(CFG_SUPA_URL || "").replace(/\/+$/, "");
const SUPABASE_KEY = CFG_SUPA_KEY || "";
const USE_SUPABASE = !!(SUPABASE_URL && SUPABASE_KEY);

/* supabase wins when configured — it is the recommended remote store */
const STORAGE_MODE = USE_SUPABASE ? "supabase" : USE_KV ? "kv" : "file";

/* ------------------------------------------------------------
   Degradation guard. The README promises that when Supabase is
   unreachable or misconfigured the app falls back to the local
   file store instead of silently serving an empty database. That
   is what this flag implements: the first request that proves the
   configured Supabase is unusable (DNS/network failure, missing
   table, revoked key, no RLS grant) switches the app to the file
   backend for a short window, then retries Supabase so it recovers
   automatically when the database comes back.
   ------------------------------------------------------------ */
let supabaseDown = false;
let supabaseDownAt = 0;
const SUPABASE_RETRY_MS = 30 * 1000;

function effectiveMode() {
  if (supabaseDown && Date.now() - supabaseDownAt > SUPABASE_RETRY_MS) {
    supabaseDown = false;
  }
  return supabaseDown ? "file" : STORAGE_MODE;
}

function getStorageMode() {
  return effectiveMode();
}

function markSupabaseDown(reason) {
  if (!USE_SUPABASE) return;
  supabaseDown = true;
  supabaseDownAt = Date.now();
  console.error(
    "[store] Supabase is unreachable/misconfigured (" +
      (reason || "unknown error") +
      "). Falling back to the local file store. Check SUPABASE_URL / SUPABASE_KEY " +
      "and that supabase-setup.sql has been run. The app retries Supabase automatically."
  );
}

if (!USE_SUPABASE && !USE_KV && process.env.VERCEL) {
  console.warn(
    "[anbu] WARNING: running on Vercel WITHOUT a database — every uploaded " +
      "image/APK/project will reset when the server restarts. Add Vercel KV " +
      "or set SUPABASE_URL + SUPABASE_KEY to keep data permanently."
  );
}

if (!USE_SUPABASE && process.env.SUPABASE_URL && !SUPABASE_KEY) {
  console.warn("[anbu] SUPABASE_URL is set but SUPABASE_KEY is missing — falling back to file storage.");
}

/* ============================================================
   GENERIC KEY/VALUE INTERFACE
   dbGet(dbKey, fallback) / dbSet(dbKey, value) / dbDel(dbKey)
   ============================================================ */

async function dbGet(key, fallback) {
  if (effectiveMode() === "supabase") return sbGet(key, fallback);
  if (effectiveMode() === "kv") return kvGet(kvKey("anbu", ...key.split(":")), fallback);
  return fileGet(key, fallback);
}

async function dbSet(key, value) {
  if (effectiveMode() === "supabase") return sbSet(key, value);
  if (effectiveMode() === "kv") return kvSet(kvKey("anbu", ...key.split(":")), value);
  return fileSet(key, value);
}

async function dbDel(key) {
  if (effectiveMode() === "supabase") return sbDel(key);
  if (effectiveMode() === "kv") return kvDel(kvKey("anbu", ...key.split(":")));
  return fileDel(key);
}

function kvKey(...parts) {
  return parts.join(":");
}

/* ============================================================
   SUPABASE BACKEND (PostgREST, single jsonb kv table)
   Table: anbu_store (key text primary key, value jsonb)
   See supabase-setup.sql in this repo to create it.
   ============================================================ */

async function sbRequest(pathname, options) {
  let res;
  try {
    res = await fetchLike(SUPABASE_URL + "/rest/v1/" + pathname, {
      method: options.method || "GET",
      headers: Object.assign(
        {
          apikey: SUPABASE_KEY,
          Authorization: "Bearer " + SUPABASE_KEY,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        options.headers || {}
      ),
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch (e) {
    /* network failure / missing global fetch -> database unreachable */
    markSupabaseDown(e && e.message ? e.message : String(e));
    throw e;
  }
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.text()).slice(0, 300);
    } catch (e) {
      /* ignore */
    }
    /* 401/403 (bad/revoked key), 404/405 (table missing, wrong
       project) and RLS errors mean the deployment is misconfigured
       — fall back to the file store instead of serving nothing. */
    if (
      res.status === 401 ||
      res.status === 403 ||
      res.status === 404 ||
      res.status === 405 ||
      /relation|42P01|undefined_table|permission denied|policy/i.test(detail)
    ) {
      markSupabaseDown(res.status + (detail ? ": " + detail : ""));
    }
    throw new Error(`Supabase ${res.status}${detail ? ": " + detail : ""}`);
  }
  return res;
}

async function sbGet(key, fallback) {
  try {
    const url =
      "anbu_store?select=value&key=eq." + encodeURIComponent("anbu:" + key);
    const res = await sbRequest(url, { method: "GET" });
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) return fallback;
    const raw = rows[0].value;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (e) {
    console.error("[store] supabase get failed:", e && e.message);
    return fallback;
  }
}

async function sbSet(key, value) {
  try {
    await sbRequest("anbu_store", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: [{ key: "anbu:" + key, value }],
    });
  } catch (e) {
    console.error("[store] supabase set failed:", e && e.message);
    throw e;
  }
}

async function sbDel(key) {
  try {
    await sbRequest("anbu_store?key=eq." + encodeURIComponent("anbu:" + key), {
      method: "DELETE",
    });
  } catch (e) {
    console.error("[store] supabase delete failed:", e && e.message);
  }
}

/* ---------------- large values (APK binaries) ----------------
   One row cannot hold a 250 MB APK, so big strings are split
   into fixed-size chunks stored under "<key>#part<n>", with a
   small meta row marking the value as chunked. */

const SB_CHUNK_CHARS = 4 * 1024 * 1024; /* ~4 MB per request */

async function sbSetLarge(key, str) {
  const parts = Math.ceil(str.length / SB_CHUNK_CHARS);
  const rows = [];
  for (let i = 0; i < parts; i++) {
    rows.push({
      key: "anbu:" + key + "#part" + i,
      value: { d: str.slice(i * SB_CHUNK_CHARS, (i + 1) * SB_CHUNK_CHARS) },
    });
  }
  /* replace any previous version first */
  await sbRequest(
    "anbu_store?key=like." + encodeURIComponent("anbu:" + key + "#part%"),
    { method: "DELETE" }
  );
  /* one small request per row — never bundle big payloads together */
  for (const row of rows) {
    await fetchWithTimeout(
      SUPABASE_URL + "/rest/v1/anbu_store",
      {
        method: "POST",
        headers: Object.assign(
          {
            apikey: SUPABASE_KEY,
            Authorization: "Bearer " + SUPABASE_KEY,
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates",
          },
          {}
        ),
        body: JSON.stringify([row]),
      },
      120000
    ).then(async (r) => {
      if (!r.ok) throw new Error("chunk write failed: " + r.status);
      await r.text().catch(() => "");
    });
  }
  await sbRequest("anbu_store", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: [{ key: "anbu:" + key, value: { chunked: true, parts } }],
  });
}

function fetchWithTimeout(url, options, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    fetchLike(url, options)
      .then((r) => {
        clearTimeout(t);
        resolve(r);
      })
      .catch((e) => {
        clearTimeout(t);
        reject(e);
      });
  });
}

async function sbGetLarge(key, meta) {
  const wanted = [];
  for (let i = 0; i < meta.parts; i++) {
    wanted.push(
      fetchWithTimeout(
        SUPABASE_URL +
          "/rest/v1/anbu_store?select=value&key=eq." +
          encodeURIComponent("anbu:" + key + "#part" + i),
        {
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: "Bearer " + SUPABASE_KEY,
            Accept: "application/json",
          },
        },
        60000
      )
    );
  }
  const results = [];
  for (let i = 0; i < wanted.length; i += 8) {
    const batch = wanted.slice(i, i + 8);
    const settled = await Promise.all(
      batch.map((p) => p.then((r) => r.json()).catch(() => []))
    );
    results.push(...settled);
  }
  let out = "";
  for (let i = 0; i < meta.parts; i++) {
    const rows = results[i];
    if (!Array.isArray(rows) || !rows.length || !rows[0].value || !rows[0].value.d) {
      console.error("[store] missing chunk", i, "of", key);
      return null;
    }
    out += rows[0].value.d;
  }
  return out;
}

async function sbDeleteLarge(key) {
  try {
    await sbRequest(
      "anbu_store?key=like." + encodeURIComponent("anbu:" + key + "#part%"),
      { method: "DELETE" }
    );
    await sbRequest("anbu_store?key=eq." + encodeURIComponent("anbu:" + key), {
      method: "DELETE",
    });
  } catch (e) {
    console.error("[store] supabase large delete failed:", e && e.message);
  }
}

/* ============================================================
   VERCEL KV / UPSTASH HELPERS
   ============================================================ */

let kv = null;
if (USE_KV) {
  // Loaded lazily so other backends never need this package installed.
  const { kv: kvClient } = require("@vercel/kv");
  kv = kvClient;
}

async function kvGet(fullKey, fallback) {
  try {
    const raw = await kv.get(fullKey);
    if (raw == null) return fallback;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (e) {
    console.error("[store] kv get failed:", e && e.message);
    return fallback;
  }
}

async function kvSet(fullKey, value) {
  try {
    await kv.set(fullKey, JSON.stringify(value));
  } catch (e) {
    console.error("[store] kv set failed:", e && e.message);
    throw e;
  }
}

async function kvDel(fullKey) {
  try {
    await kv.del(fullKey);
  } catch (e) {
    console.error("[store] kv del failed:", e && e.message);
  }
}

/* ============================================================
   FILE BACKEND (data/db.json)
   Every operation works straight off disk — no long-lived memory
   cache. Writes are serialized through one chain and land via a
   temp file + atomic rename, so a read never sees a half written
   file and parallel processes can never silently wipe uploads.
   ============================================================ */

const DB_FILE = path.join(__dirname, "..", "data", "db.json");

let writeChain = Promise.resolve();

function normalizeDb(raw) {
  const db = raw && typeof raw === "object" ? raw : {};
  if (!db.members || typeof db.members !== "object") db.members = {};
  if (!db.projects || typeof db.projects !== "object") db.projects = {};
  if (!db.apks || typeof db.apks !== "object") db.apks = {};
  if (!db.news || typeof db.news !== "object") db.news = {};
  if (!db.admin || typeof db.admin !== "object") db.admin = null;
  return db;
}

function readDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      return normalizeDb(JSON.parse(fs.readFileSync(DB_FILE, "utf8")));
    }
  } catch (e) {
    console.error("[store] db.json unreadable, starting empty:", e && e.message);
  }
  return normalizeDb(null);
}

function writeDbAtomic(db) {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  const tmp = DB_FILE + ".tmp-" + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

/* one serialized read -> mutate -> atomic write */
function fileUpdate(mutator) {
  writeChain = writeChain.then(() => {
    try {
      const db = readDb();
      mutator(db);
      writeDbAtomic(db);
    } catch (e) {
      console.error("[store] file write failed:", e && e.message);
    }
  });
  return writeChain;
}

/* file records live under four sections; map logical db keys onto them
   ("member:x" -> members.x, "apk:o:i" -> apks."o:i", "project:o:i" ->
   projects[o][i]). "*-list" index keys are not needed on disk because
   the file layout already groups everything — they become no-ops. */
function fileSection(key) {
  const idx = key.indexOf(":");
  const head = idx < 0 ? key : key.slice(0, idx);
  const sub = idx < 0 ? null : key.slice(idx + 1);
  const plural = { member: "members", apk: "apks", project: "projects", news: "news" };
  return { section: plural[head] || head, sub };
}

async function fileGet(key, fallback) {
  const { section, sub } = fileSection(key);
  const db = readDb();
  if (!sub) return db[section] != null ? db[section] : fallback;
  if (section.endsWith("-list")) return fallback;
  if (section === "members") return db.members[sub] || fallback;
  if (section === "news") return db.news[sub] || fallback; /* sub = news id */
  if (section === "apks") return db.apks[sub] || fallback; /* sub = owner:id */
  if (section === "projects") {
    const at = sub.indexOf(":"); /* sub = owner:id */
    if (at < 0) return fallback;
    const owner = sub.slice(0, at);
    const id = sub.slice(at + 1);
    return (db.projects[owner] || {})[id] || fallback;
  }
  return fallback;
}

async function fileSet(key, value) {
  const { section, sub } = fileSection(key);
  return fileUpdate((db) => {
    if (section.endsWith("-list")) return;
    if (!sub) {
      /* top-level scalar record (e.g. "admin") */
      db[section] = value;
      return;
    }
    if (section === "members") {
      db.members[sub] = value;
    } else if (section === "news") {
      db.news[sub] = value;
    } else if (section === "apks") {
      db.apks[sub] = value;
    } else if (section === "projects") {
      const at = sub.indexOf(":"); /* sub = owner:id */
      if (at < 0) return;
      const owner = sub.slice(0, at);
      const id = sub.slice(at + 1);
      if (!db.projects[owner]) db.projects[owner] = {};
      db.projects[owner][id] = value;
    }
  });
}

async function fileDel(key) {
  const { section, sub } = fileSection(key);
  return fileUpdate((db) => {
    if (section.endsWith("-list")) return;
    if (!sub) {
      /* top-level scalar record (e.g. "admin") */
      delete db[section];
      return;
    }
    if (section === "members") delete db.members[sub];
    else if (section === "news") delete db.news[sub];
    else if (section === "apks") delete db.apks[sub];
    else if (section === "projects") {
      const at = sub.indexOf(":");
      if (at < 0) return;
      const owner = sub.slice(0, at);
      const id = sub.slice(at + 1);
      if (db.projects[owner]) delete db.projects[owner][id];
    }
  });
}

/* ============================================================
   PUBLIC API
   ============================================================ */

/* ---------------- admin ---------------- */

async function getAdmin() {
  return dbGet("admin", null);
}

async function setAdmin(rec) {
  return dbSet("admin", rec);
}

/* ---------------- members ---------------- */

async function getMember(slug) {
  slug = String(slug || "").toLowerCase();
  if (!slug) return null;
  return dbGet("member:" + slug, null);
}

async function getAllMembers() {
  const slugs = (await dbGet("member-list", [])) || [];
  const out = [];
  for (const slug of slugs) {
    const m = await getMember(slug);
    if (m) out.push(m);
  }
  /* file backend keeps members inline too — merge anything not in list */
  if (effectiveMode() === "file") {
    const db = readDb();
    for (const slug of Object.keys(db.members)) {
      if (!out.some((m) => m.slug === slug)) out.push(db.members[slug]);
    }
  }
  return out;
}

async function setMember(member) {
  const slug = String(member.slug || "").toLowerCase();
  if (!slug) return;
  await dbSet("member:" + slug, member);
  const slugs = (await dbGet("member-list", [])) || [];
  if (!slugs.includes(slug)) {
    await dbSet("member-list", slugs.concat(slug));
  }
}

/* ---------------- projects ---------------- */

async function getProject(ownerSlug, id) {
  ownerSlug = String(ownerSlug || "").toLowerCase();
  if (!ownerSlug || !id) return null;
  return dbGet(`project:${ownerSlug}:${id}`, null);
}

async function getProjects(ownerSlug) {
  ownerSlug = String(ownerSlug || "").toLowerCase();
  if (!ownerSlug) return [];
  const ids = (await dbGet("project-list:" + ownerSlug, [])) || [];
  const out = [];
  for (const id of ids) {
    const p = await getProject(ownerSlug, id);
    if (p) out.push(p);
  }
  /* file backend also keeps projects grouped per owner inline */
  if (effectiveMode() === "file") {
    const grouped = readDb().projects[ownerSlug] || {};
    for (const id of Object.keys(grouped)) {
      if (!out.some((p) => p.id === id)) out.push(grouped[id]);
    }
  }
  return out;
}

async function setProject(project) {
  const owner = String(project.owner || "").toLowerCase();
  if (!owner || !project.id) return;
  await dbSet(`project:${owner}:${project.id}`, project);
  const ids = (await dbGet("project-list:" + owner, [])) || [];
  if (!ids.includes(project.id)) {
    await dbSet("project-list:" + owner, ids.concat(project.id));
  }
}

async function deleteProject(ownerSlug, id) {
  ownerSlug = String(ownerSlug || "").toLowerCase();
  if (!ownerSlug || !id) return;
  await dbDel(`project:${ownerSlug}:${id}`);
  const ids = (await dbGet("project-list:" + ownerSlug, [])) || [];
  await dbSet("project-list:" + ownerSlug, ids.filter((x) => x !== id));
}

/* ---------------- APK binaries ----------------
   Stored apart from the project records so normal saves never
   rewrite the big base64 blob. On Supabase, values larger than
   one request can carry are split into chunk rows automatically. */

function apkKey(ownerSlug, id) {
  return `apk:${String(ownerSlug).toLowerCase()}:${id}`;
}

async function getApk(ownerSlug, id) {
  ownerSlug = String(ownerSlug || "").toLowerCase();
  if (!ownerSlug || !id) return null;
  const key = apkKey(ownerSlug, id);
  if (effectiveMode() === "supabase") {
    const meta = await dbGet(key, null);
    if (meta && typeof meta === "object" && meta.chunked) {
      return sbGetLarge(key, meta);
    }
    return meta;
  }
  return dbGet(key, null);
}

async function setApk(ownerSlug, id, dataUrl) {
  ownerSlug = String(ownerSlug || "").toLowerCase();
  if (!ownerSlug || !id || !dataUrl) return;
  const key = apkKey(ownerSlug, id);
  if (
    effectiveMode() === "supabase" &&
    typeof dataUrl === "string" &&
    dataUrl.length > SB_CHUNK_CHARS
  ) {
    return sbSetLarge(key, dataUrl);
  }
  return dbSet(key, dataUrl);
}

async function deleteApk(ownerSlug, id) {
  ownerSlug = String(ownerSlug || "").toLowerCase();
  if (!ownerSlug || !id) return;
  const key = apkKey(ownerSlug, id);
  if (effectiveMode() === "supabase") {
    const meta = await dbGet(key, null);
    if (meta && typeof meta === "object" && meta.chunked) return sbDeleteLarge(key);
    return sbDel(key);
  }
  return dbDel(key);
}

/* ---------------- News feed ----------------
   Short intel posts written by operatives. Stored as
   "news:<id>" records plus a "news-list" index. */

async function getNews(id) {
  if (!id) return null;
  return dbGet("news:" + id, null);
}

async function getAllNews() {
  const ids = (await dbGet("news-list", [])) || [];
  const out = [];
  for (const id of ids) {
    const n = await getNews(id);
    if (n) out.push(n);
  }
  /* file backend keeps news inline too — merge anything not in the list */
  if (effectiveMode() === "file") {
    const inline = readDb().news || {};
    for (const id of Object.keys(inline)) {
      if (!out.some((n) => n.id === id)) out.push(inline[id]);
    }
  }
  return out.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

async function setNews(item) {
  if (!item || !item.id) return;
  await dbSet("news:" + item.id, item);
  const ids = (await dbGet("news-list", [])) || [];
  if (!ids.includes(item.id)) {
    await dbSet("news-list", ids.concat(item.id));
  }
}

async function deleteNews(id) {
  if (!id) return;
  await dbDel("news:" + id);
  const ids = (await dbGet("news-list", [])) || [];
  if (ids.includes(id)) {
    await dbSet("news-list", ids.filter((x) => x !== id));
  }
}

module.exports = {
  USE_KV,
  STORAGE_MODE,
  getStorageMode,
  getAdmin,
  setAdmin,
  getMember,
  getAllMembers,
  setMember,
  getProject,
  getProjects,
  setProject,
  deleteProject,
  getApk,
  setApk,
  deleteApk,
  getNews,
  getAllNews,
  setNews,
  deleteNews,
  hashPassword,
  verifyPassword,
};
