/* ============================================================
   ANBU BLACK OPS — API client
   ------------------------------------------------------------
   Thin fetch wrapper for the shared backend. Every call goes to
   /api/* so all browsers hitting the site read and write the
   same server-side data. Falls back to localStorage when the
   backend is unreachable (e.g. the page is opened as a file).
   ============================================================ */

(function () {
  const API_BASE = "/api";

  /* memory-only unlock store — cleared on every page load */
  const memSession = {};

  function fallbackStore() {
    try {
      return JSON.parse(localStorage.getItem("anbu-fallback") || "{}");
    } catch {
      return {};
    }
  }

  function fallbackSave(obj) {
    try {
      localStorage.setItem("anbu-fallback", JSON.stringify(obj));
    } catch (e) {
      /* ignore quota errors */
    }
  }

  async function request(method, path, body) {
    const res = await fetch(API_BASE + path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || "Request failed");
      err.status = res.status;
      throw err;
    }
    return data;
  }

  const api = {
    /* ---------- server reachability ---------- */
    async health() {
      return request("GET", "/health");
    },

    /* ---------- members ---------- */
    async listMembers() {
      try {
        return await request("GET", "/members");
      } catch (e) {
        const fb = fallbackStore();
        return fb.members && fb.members.length ? fb.members : window.MEMBERS || [];
      }
    },

    async getMember(slug) {
      try {
        return await request("GET", "/members/" + slug);
      } catch (e) {
        const fb = fallbackStore();
        if (fb.members) {
          const m = fb.members.find((x) => x.slug === slug);
          if (m) return m;
        }
        return (window.MEMBERS || []).find((m) => m.slug === slug) || null;
      }
    },

    async verify(slug, password) {
      return request("POST", "/verify", { slug, password });
    },

    async updateMember(slug, fields) {
      return request("POST", "/members/" + slug, fields);
    },

    async changePassword(slug, fields) {
      return request("POST", "/members/" + slug + "/password", fields);
    },

    async updatePhoto(slug, fields) {
      return request("POST", "/members/" + slug + "/photo", fields);
    },

    async currentPassword(slug, fields) {
      return request("POST", "/members/" + slug + "/current-password", fields);
    },

    /* admin-only: every operative's individual password */
    async adminPasswords(fields) {
      return request("POST", "/admin/passwords", fields);
    },

    /* ---------- projects ---------- */
    async listProjects(slug) {
      try {
        return await request("GET", "/projects/" + slug);
      } catch (e) {
        const fb = fallbackStore();
        return fb["projects:" + slug] || [];
      }
    },

    async createProject(slug, fields) {
      return request("POST", "/projects/" + slug, fields);
    },

    async updateProject(slug, id, fields) {
      return request("PUT", "/projects/" + slug + "/" + id, fields);
    },

    async deleteProject(slug, id, fields) {
      return request("DELETE", "/projects/" + slug + "/" + id, fields);
    },

    async uploadApk(slug, id, fields) {
      return request("POST", "/projects/" + slug + "/" + id + "/apk", fields);
    },

    downloadUrl(slug, id) {
      return API_BASE + "/projects/" + slug + "/" + id + "/download";
    },

    /* ---------- news feed ---------- */
    async newsMeta() {
      return request("GET", "/news/meta");
    },

    /* public read — anyone can read; posting/deleting needs a code */
    async listNews() {
      return request("GET", "/news");
    },

    async listNewsAuth(fields) {
      return request("POST", "/news/list", fields);
    },

    async createNews(fields) {
      return request("POST", "/news", fields);
    },

    async deleteNews(id, fields) {
      return request("DELETE", "/news/" + id, fields);
    },
  };

  window.ANBU = {
    api,
    fallbackStore,
    fallbackSave,
    /* Admin + card passwords are verified by the server; these
       session helpers hold unlocks in MEMORY ONLY. The moment you
       reload or navigate to another page everything locks again —
       every open asks for the password anew. */
    adminSessionKey: "anbu-admin-session",
    ownerSessionKey: "anbu-owner-session",
    setSession(key, value) {
      memSession[key] = String(value);
    },
    getSession(key) {
      return Object.prototype.hasOwnProperty.call(memSession, key)
        ? memSession[key]
        : null;
    },
    clearSession(key) {
      delete memSession[key];
    },

  /* Uploaded images are scaled down and JPEG-encoded as compact
     data URLs so they fit in the shared data store. */
    compressImage(file, maxDim, quality) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Could not read the file."));
        reader.onload = () => {
          const img = new Image();
          img.onerror = () => reject(new Error("Could not read that image file."));
          img.onload = () => {
            const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
            const w = Math.max(1, Math.round(img.width * scale));
            const h = Math.max(1, Math.round(img.height * scale));
            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
              reject(new Error("Could not process that image."));
              return;
            }
            ctx.fillStyle = "#0a0a0c";
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL("image/jpeg", quality));
          };
          img.src = reader.result;
        };
        reader.readAsDataURL(file);
      });
    },
  };

  /* ---------- no-database warning banner ----------
     On localhost the file backend is fine. On a deployed host a
     file backend means there is NO persistent database attached,
     so every profile edit / upload resets when the server
     restarts. Make that visible instead of silently losing data. */
  function showStorageBanner(reason) {
    if (document.getElementById("anbu-storage-banner")) return;
    const bar = document.createElement("div");
    bar.id = "anbu-storage-banner";
    bar.className = "storage-banner";
    bar.textContent =
      reason ||
      "This deployment has NO database attached — profile edits and uploads will reset on every restart. Attach Vercel KV (or another persistent Redis) to keep data.";
    if (document.body) {
      document.body.appendChild(bar);
    } else {
      document.addEventListener("DOMContentLoaded", () => document.body.appendChild(bar));
    }
  }

  if (typeof location !== "undefined") {
    const localHost = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
    const runCheck = async () => {
      if (localHost) return; /* local file backend is persistent */

      /* The backend briefly reports "file" while it retries a
         misbehaving database (up to ~30s), so only show the warning
         after the degraded state is confirmed a few times in a row. */
      const TRIES = 3;
      const RETRY_MS = 2000;
      for (let i = 0; i < TRIES; i++) {
        let degraded = false;
        try {
          const h = await request("GET", "/health");
          degraded = !!(h && h.storage === "file");
        } catch (e) {
          if (location.protocol === "file:") {
            showStorageBanner(
              "Opened as a local file — there is no server, so nothing can be saved. Run \"npm start\" and open http://localhost:3001."
            );
          }
          return;
        }
        if (!degraded) return; /* healthy database — no warning */
        if (i < TRIES - 1) await new Promise((r) => setTimeout(r, RETRY_MS));
      }
      showStorageBanner(
        "This deployment has NO database attached — profile edits and uploads will reset on every restart. Attach Vercel KV or set SUPABASE_URL + SUPABASE_KEY to keep data."
      );
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", runCheck);
    } else {
      runCheck();
    }
  }
})();
