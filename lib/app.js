/* ============================================================
   ANBU BLACK OPS — Express application (API only)
   ------------------------------------------------------------
   Shared by:
     - server.js   (local / preview: adds static serving + listen)
     - api/index.js (Vercel serverless: exports the app)

   All data lives behind lib/store.js so every edit made by any
   user is persisted server-side and visible to everyone else.
   ============================================================ */

const express = require("express");
const crypto = require("crypto");

const store = require("./store");

const ADMIN_SEED_PASSWORD = "@820069";
const DEFAULT_MEMBER_PASSWORD = (i) => "anbu-" + String(i + 1).padStart(2, "0");

/* ~250 MB raw file -> ~333 MB base64. JSON body limit below covers it.
   Note: Vercel serverless caps request bodies at a few MB — big APK
   uploads only work on the local Node server. */
const MAX_APK_BYTES = 250 * 1024 * 1024;

function normalizeLink(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const withProto = /^https?:\/\//i.test(s) ? s : "https://" + s;
  try {
    const u = new URL(withProto);
    return u.href;
  } catch {
    return "";
  }
}

function sanitizeFileName(raw, fallback) {
  let s = String(raw || "").trim().replace(/[\\/:*?"<>|]+/g, "_");
  if (!s) s = fallback;
  return s.toLowerCase().endsWith(".apk") ? s : s + ".apk";
}

function createApp() {
  const app = express();

  /* Auto-wrap every route so async errors (e.g. database down)
     become clean 500 JSON responses instead of hanging requests
     (Express 4 does not catch rejected promises on its own). */
  const wrapAsync = (fn) =>
    function wrapped(req, res, next) {
      Promise.resolve(fn.call(this, req, res, next)).catch(next);
    };
  ["get", "post", "put", "delete", "patch", "all"].forEach((method) => {
    const original = app[method].bind(app);
    app[method] = (pathname, ...handlers) => {
      original(
        pathname,
        ...handlers.map((h) => (typeof h === "function" ? wrapAsync(h) : h))
      );
    };
  });

  app.use(express.json({ limit: "400mb" }));

  /* API responses are dynamic — never let a browser or edge cache
     serve a stale /api/health (which would show the storage banner
     even after the database is attached). */
  app.use("/api", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  /* ---------------- helpers ---------------- */
  function publicMember(m) {
    if (!m) return null;
    const { password, passwordHash, passPlain, ...rest } = m;
    return rest;
  }

  async function ensureSeeded() {
    const admin = await store.getAdmin();
    /* Seed the admin account only when it does not exist yet (or is
       missing its hash fields). We must NOT re-seed on password
       mismatch — doing so would silently revert any admin password
       change on the very next request, which breaks the password
       update system. */
    if (!admin || !admin.hash || !admin.salt) {
      await store.setAdmin(store.hashPassword(ADMIN_SEED_PASSWORD));
    }

    const existing = await store.getAllMembers();
    if (!existing.length) {
      const seed = require("../js/members.js");
      for (let i = 0; i < seed.length; i++) {
        const m = Object.assign({}, seed[i]);
        m.passwordHash = store.hashPassword(DEFAULT_MEMBER_PASSWORD(i));
        m.passPlain = DEFAULT_MEMBER_PASSWORD(i);
        await store.setMember(m);
      }
    }
  }

  async function authLevel(slug, body) {
    const m = await store.getMember(slug);
    const adminHash = await store.getAdmin();
    // admin password wins — accepted in either the password or adminPassword field
    if (
      (body.adminPassword || body.password) &&
      store.verifyPassword(body.adminPassword || body.password, adminHash)
    ) {
      return "admin";
    }
    if (m && body.password && store.verifyPassword(body.password, m.passwordHash)) {
      return "owner";
    }
    return null;
  }

  app.use(async (req, res, next) => {
    try {
      await ensureSeeded();
      next();
    } catch (e) {
      console.error("[app] seed failed:", e && e.message);
      next();
    }
  });

  /* ---------------- public reads ---------------- */
  app.get("/api/health", (req, res) =>
    res.json({ ok: true, storage: store.getStorageMode() })
  );

  app.get("/api/members", async (req, res) => {
    try {
      const list = await store.getAllMembers();
      res.json(list.map(publicMember));
    } catch (e) {
      res.status(500).json({ error: "Could not load members." });
    }
  });

  app.get("/api/members/:slug", async (req, res) => {
    const m = await store.getMember(req.params.slug);
    if (!m) return res.status(404).json({ error: "Member not found." });
    res.json(publicMember(m));
  });

  /* ---------------- unlock check ---------------- */
  app.post("/api/verify", async (req, res) => {
    const { slug, password } = req.body || {};
    const level = await authLevel(slug, { password });
    if (level) return res.json({ level, ok: true });
    res.status(401).json({ ok: false, error: "Access denied." });
  });

  /* ---------------- current password (admin only) ---------------- */
  app.post("/api/members/:slug/current-password", async (req, res) => {
    const slug = String(req.params.slug || "").toLowerCase();
    const level = await authLevel(slug, req.body || {});
    if (level !== "admin") return res.status(401).json({ error: "Access denied." });

    const m = await store.getMember(slug);
    if (!m) return res.status(404).json({ error: "Member not found." });
    res.json({ password: m.passPlain || "" });
  });

  /* ---------------- all operative passwords (admin only) ----------------
     Lets the admin see and hand out every operative's individual card
     password in one place. Requires the admin password. */
  app.post("/api/admin/passwords", async (req, res) => {
    const level = await authLevel("", req.body || {});
    if (level !== "admin") return res.status(401).json({ error: "Access denied." });

    const members = await store.getAllMembers();
    const passwords = {};
    for (const m of members) {
      passwords[m.slug] = m.passPlain || "";
    }
    res.json({ passwords });
  });

  /* ---------------- profile updates ---------------- */
  app.post("/api/members/:slug", async (req, res) => {
    const slug = String(req.params.slug || "").toLowerCase();
    const level = await authLevel(slug, req.body || {});
    if (!level) return res.status(401).json({ error: "Access denied." });

    const m = (await store.getMember(slug)) || { slug };
    const next = Object.assign({}, m);

    const editable = ["name", "bio", "detail", "photo", "linkedin", "github", "email"];
    if (level === "admin") editable.push("rank", "role");

    for (const field of editable) {
      if (typeof req.body[field] === "string") {
        if (field === "linkedin" || field === "github") {
          /* social links get URL-normalized; empty string clears them */
          next[field] = normalizeLink(req.body[field]);
        } else if (field === "email") {
          const email = String(req.body[field] || "").trim().toLowerCase();
          if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ error: "That email address is not valid." });
          }
          next[field] = email;
        } else {
          next[field] = req.body[field];
        }
      }
    }

    await store.setMember(next);
    res.json(publicMember(next));
  });

  app.post("/api/members/:slug/password", async (req, res) => {
    const slug = String(req.params.slug || "").toLowerCase();
    const level = await authLevel(slug, req.body || {});
    if (!level) return res.status(401).json({ error: "Access denied." });

    const newPw = String(req.body.newPassword || "").trim();
    if (!newPw) return res.status(400).json({ error: "New password is required." });

    const m = await store.getMember(slug);
    if (!m) return res.status(404).json({ error: "Member not found." });

    m.passwordHash = store.hashPassword(newPw);
    m.passPlain = newPw;
    await store.setMember(m);
    res.json({ ok: true });
  });

  app.post("/api/members/:slug/photo", async (req, res) => {
    const slug = String(req.params.slug || "").toLowerCase();
    const level = await authLevel(slug, req.body || {});
    if (!level) return res.status(401).json({ error: "Access denied." });

    const photo = String(req.body.photo || "");
    if (!photo) return res.status(400).json({ error: "Photo is required." });

    const m = (await store.getMember(slug)) || { slug };
    m.photo = photo;
    await store.setMember(m);
    res.json(publicMember(m));
  });

  /* ---------------- news feed ---------------- */

  /* Public, no content — powers the notification dot on the news icon. */
  app.get("/api/news/meta", async (req, res) => {
    const all = await store.getAllNews();
    res.json({
      count: all.length,
      latestAt: all.length ? all[0].createdAt : 0,
    });
  });

  /* Reading intel is members-only: needs a card password or admin. */
  app.post("/api/news/list", async (req, res) => {
    const slug = String((req.body || {}).slug || "").toLowerCase();
    const level = await authLevel(slug, req.body || {});
    if (!level) return res.status(401).json({ error: "Access denied." });
    res.json(await store.getAllNews());
  });

  app.get("/api/news", async (req, res) => {
    res.json(await store.getAllNews());
  });

  app.post("/api/news", async (req, res) => {
    const slug = String((req.body || {}).slug || "").toLowerCase();
    const level = await authLevel(slug, req.body || {});
    if (!level) return res.status(401).json({ error: "Access denied." });

    const text = String(req.body.text || "").trim();
    if (!text) return res.status(400).json({ error: "News text is required." });
    if (text.length > 1000) {
      return res.status(400).json({ error: "News is limited to 1000 characters." });
    }

    const member = await store.getMember(slug);
    const item = {
      id: Date.now().toString(36) + "-" + crypto.randomBytes(4).toString("hex"),
      owner: slug,
      ownerName: (member && member.name) || slug.toUpperCase(),
      ownerRank: (member && member.rank) || "",
      text,
      createdAt: Date.now(),
    };
    await store.setNews(item);
    res.json(item);
  });

  app.delete("/api/news/:id", async (req, res) => {
    const item = await store.getNews(req.params.id);
    if (!item) return res.status(404).json({ error: "News not found." });

    /* slug may be omitted by clients that only hold a card password */
    const effSlug =
      String((req.body || {}).slug || "").toLowerCase() ||
      String(item.owner || "").toLowerCase();
    const level = await authLevel(effSlug, req.body || {});
    if (!level) return res.status(401).json({ error: "Access denied." });

    /* only the author or the admin may delete */
    if (level !== "admin" && !(level === "owner" && effSlug === String(item.owner || "").toLowerCase())) {
      return res.status(401).json({ error: "Access denied." });
    }

    await store.deleteNews(item.id);
    res.json({ ok: true });
  });

  /* ---------------- projects ---------------- */
  function projectType(body) {
    const t = String((body || {}).type || "").toLowerCase();
    return t === "app" || t === "web" ? t : "";
  }

  app.get("/api/projects/:slug", async (req, res) => {
    const slug = String(req.params.slug || "").toLowerCase();
    const list = await store.getProjects(slug);
    res.json(list);
  });

  app.post("/api/projects/:slug", async (req, res) => {
    const slug = String(req.params.slug || "").toLowerCase();
    const level = await authLevel(slug, req.body || {});
    if (!level) return res.status(401).json({ error: "Access denied." });

    const now = Date.now();
    const type = projectType(req.body);
    const project = {
      id: now.toString(36) + "-" + crypto.randomBytes(4).toString("hex"),
      owner: slug,
      type,
      name: String(req.body.name || "").trim() || "Untitled Project",
      intro: String(req.body.intro || ""),
      report: String(req.body.report || ""),
      linkUrl: type === "web" ? normalizeLink(req.body.linkUrl) : "",
      apkName: "",
      apkSize: 0,
      createdAt: now,
      updatedAt: now,
    };

    await store.setProject(project);
    res.json(project);
  });

  app.put("/api/projects/:slug/:id", async (req, res) => {
    const slug = String(req.params.slug || "").toLowerCase();
    const id = String(req.params.id || "");
    const level = await authLevel(slug, req.body || {});
    if (!level) return res.status(401).json({ error: "Access denied." });

    const project = await store.getProject(slug, id);
    if (!project) return res.status(404).json({ error: "Project not found." });

    project.type = projectType(req.body) || "";
    if (project.type === "web") {
      project.linkUrl = normalizeLink(req.body.linkUrl);
    } else if (typeof req.body.linkUrl === "string") {
      project.linkUrl = "";
    }
    project.name = String(req.body.name || "").trim() || "Untitled Project";
    project.intro = String(req.body.intro || "");
    project.report = String(req.body.report || "");
    project.updatedAt = Date.now();

    await store.setProject(project);
    res.json(project);
  });

  app.delete("/api/projects/:slug/:id", async (req, res) => {
    const slug = String(req.params.slug || "").toLowerCase();
    const id = String(req.params.id || "");
    const level = await authLevel(slug, req.body || {});
    if (!level) return res.status(401).json({ error: "Access denied." });

    const project = await store.getProject(slug, id);
    if (!project) return res.status(404).json({ error: "Project not found." });

    await store.deleteApk(slug, id);
    await store.deleteProject(slug, id);
    res.json({ ok: true });
  });

  /* ---------------- APK upload + download (app projects) ---------------- */
  app.post("/api/projects/:slug/:id/apk", async (req, res) => {
    const slug = String(req.params.slug || "").toLowerCase();
    const id = String(req.params.id || "");
    const level = await authLevel(slug, req.body || {});
    if (!level) return res.status(401).json({ error: "Access denied." });

    const project = await store.getProject(slug, id);
    if (!project) return res.status(404).json({ error: "Project not found." });

    const dataUrl = String(req.body.apk || "");
    const commaAt = dataUrl.indexOf(",");
    if (commaAt < 0) {
      return res.status(400).json({ error: "APK file is missing or unreadable." });
    }

    let buf;
    try {
      buf = Buffer.from(dataUrl.slice(commaAt + 1), "base64");
    } catch (e) {
      buf = null;
    }
    if (!buf || !buf.length) {
      return res.status(400).json({ error: "APK file is missing or unreadable." });
    }
    if (buf.length > MAX_APK_BYTES) {
      return res.status(413).json({ error: "APK is too large. Maximum is 250 MB." });
    }

    await store.setApk(slug, id, dataUrl);

    project.apkName = sanitizeFileName(req.body.fileName, project.name || "app");
    project.apkSize = buf.length;
    project.updatedAt = Date.now();
    await store.setProject(project);

    res.json({ ok: true, apkName: project.apkName, apkSize: project.apkSize });
  });

  app.get("/api/projects/:slug/:id/download", async (req, res) => {
    const slug = String(req.params.slug || "").toLowerCase();
    const id = String(req.params.id || "");

    const dataUrl = await store.getApk(slug, id);
    if (!dataUrl) return res.status(404).json({ error: "No APK file on this project." });

    const commaAt = dataUrl.indexOf(",");
    let buf = null;
    try {
      buf = Buffer.from(dataUrl.slice(commaAt + 1), "base64");
    } catch (e) {
      buf = null;
    }
    if (!buf || !buf.length) return res.status(404).json({ error: "APK file is corrupt." });

    const project = await store.getProject(slug, id);
    const fileName = sanitizeFileName(
      (project && project.apkName) || (project && project.name) || "anbu-app",
      "anbu-app"
    );

    res.setHeader("Content-Type", "application/vnd.android.package-archive");
    res.setHeader("Content-Disposition", 'attachment; filename="' + fileName + '"');
    res.setHeader("Content-Length", buf.length);
    res.send(buf);
  });

  /* central error handler -> JSON, never hangs */
  app.use((err, req, res, next) => {
    console.error("[app] request failed:", err && err.message);
    if (!res.headersSent) {
      res.status(500).json({
        error:
          (err && err.message) ||
          "Server storage error — check that the database is configured.",
      });
    } else {
      next(err);
    }
  });

  return app;
}

module.exports = { createApp, ADMIN_SEED_PASSWORD, DEFAULT_MEMBER_PASSWORD };
