/* ============================================================
   ANBU BLACK OPS — Supabase adapter (Postgres + Storage)
   ------------------------------------------------------------
   Activated automatically when SUPABASE_URL and
   SUPABASE_SERVICE_ROLE_KEY are present in the environment.

   Persistence:
     - anbu_admin    (single row: id = 1, salt, hash)
     - anbu_members  (slug -> jsonb payload)
     - anbu_projects (owner + id -> jsonb payload)

   Storage:
     - Images (photos + report images) are uploaded to the
       `anbu-images` public bucket. The bucket is created on
       first use if it does not exist yet.

   The service role key bypasses RLS, so tables are created once
   with `db-setup.sql` and then just work. Every exposed function
   is async.
   ============================================================ */

const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "anbu-images";

const ENABLED = !!(URL && SERVICE_KEY);

let client = null;
let bucketReady = false;
if (ENABLED) {
  client = createClient(URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/* ---------------- storage helpers ---------------- */

async function ensureBucket() {
  if (!client || bucketReady) return;
  try {
    const { error } = await client.storage.getBucket(BUCKET);
    if (error && error.statusCode === 404) {
      const { error: createError } = await client.storage.createBucket(BUCKET, {
        public: true,
      });
      if (createError) throw createError;
    }
    bucketReady = true;
  } catch (e) {
    console.error("[supabase] bucket check failed:", e && (e.message || e.error_description || e));
  }
}

const DATA_URL_RE = /^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/;

/**
 * Upload a base64 data URL to Supabase Storage and return a public URL.
 * Non-data URLs (http/https) pass through untouched.
 */
async function uploadImage(dataUrl) {
  if (!ENABLED || !client) return dataUrl;
  if (typeof dataUrl !== "string" || !DATA_URL_RE.test(dataUrl)) return dataUrl;

  const match = DATA_URL_RE.exec(dataUrl);
  const mime = match[1];
  const ext =
    (mime.split("/")[1] || "jpg").replace(/[^a-z0-9]/gi, "").slice(0, 5) || "jpg";
  const bytes = Buffer.from(match[2], "base64");
  const name = `${Date.now().toString(36)}-${crypto.randomBytes(6).toString("hex")}.${ext}`;

  await ensureBucket();
  const { error } = await client.storage
    .from(BUCKET)
    .upload(name, new Blob([bytes], { type: mime }), { contentType: mime });
  if (error) throw error;

  const { data } = client.storage.from(BUCKET).getPublicUrl(name);
  return data.publicUrl;
}

/* ---------------- Postgres helpers ---------------- */

function mapError(prefix) {
  return (e) => {
    const msg = e && (e.message || e.error_description || e);
    console.error(prefix, msg);
    if (ENABLED && /does not exist|could not find the table|relation|42P01|undefined_table/i.test(String(msg || ""))) {
      console.error(
        "[supabase] Tables missing. Open your project's SQL Editor and run the contents of db-setup.sql (one time)."
      );
    }
    throw e;
  };
}

async function getAdmin() {
  const { data, error } = await client
    .from("anbu_admin")
    .select("salt, hash")
    .eq("id", 1)
    .maybeSingle();
  if (error) mapError("[supabase] getAdmin failed:")(error);
  return data || null;
}

async function setAdmin(rec) {
  const { error } = await client
    .from("anbu_admin")
    .upsert({ id: 1, salt: rec.salt, hash: rec.hash }, { onConflict: "id" });
  if (error) mapError("[supabase] setAdmin failed:")(error);
}

async function getMember(slug) {
  slug = String(slug || "").toLowerCase();
  if (!slug) return null;
  const { data, error } = await client
    .from("anbu_members")
    .select("payload")
    .eq("slug", slug)
    .maybeSingle();
  if (error) mapError("[supabase] getMember failed:")(error);
  return data ? data.payload : null;
}

async function getAllMembers() {
  const { data, error } = await client.from("anbu_members").select("payload");
  if (error) mapError("[supabase] getAllMembers failed:")(error);
  return (data || []).map((r) => r.payload);
}

async function setMember(member) {
  const slug = String(member.slug || "").toLowerCase();
  if (!slug) return;
  const { error } = await client
    .from("anbu_members")
    .upsert({ slug, payload: member }, { onConflict: "slug" });
  if (error) mapError("[supabase] setMember failed:")(error);
}

async function getProject(ownerSlug, id) {
  ownerSlug = String(ownerSlug || "").toLowerCase();
  if (!ownerSlug || !id) return null;
  const { data, error } = await client
    .from("anbu_projects")
    .select("payload")
    .eq("owner", ownerSlug)
    .eq("id", String(id))
    .maybeSingle();
  if (error) mapError("[supabase] getProject failed:")(error);
  return data ? data.payload : null;
}

async function getProjects(ownerSlug) {
  ownerSlug = String(ownerSlug || "").toLowerCase();
  if (!ownerSlug) return [];
  const { data, error } = await client
    .from("anbu_projects")
    .select("payload")
    .eq("owner", ownerSlug)
    .order("updated_at", { ascending: false });
  if (error) mapError("[supabase] getProjects failed:")(error);
  return (data || []).map((r) => r.payload);
}

async function setProject(project) {
  const owner = String(project.owner || "").toLowerCase();
  if (!owner || !project.id) return;
  const { error } = await client.from("anbu_projects").upsert(
    {
      owner,
      id: String(project.id),
      payload: project,
      updated_at: Number(project.updatedAt) || Date.now(),
    },
    { onConflict: "owner,id" }
  );
  if (error) mapError("[supabase] setProject failed:")(error);
}

async function deleteProject(ownerSlug, id) {
  ownerSlug = String(ownerSlug || "").toLowerCase();
  if (!ownerSlug || !id) return;
  const { error } = await client
    .from("anbu_projects")
    .delete()
    .eq("owner", ownerSlug)
    .eq("id", String(id));
  if (error) mapError("[supabase] deleteProject failed:")(error);
}

module.exports = {
  ENABLED,
  getAdmin,
  setAdmin,
  getMember,
  getAllMembers,
  setMember,
  getProject,
  getProjects,
  setProject,
  deleteProject,
  uploadImage,
};
