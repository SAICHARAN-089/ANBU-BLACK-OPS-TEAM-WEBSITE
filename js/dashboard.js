/* ============================================================
   ANBU BLACK OPS — Operative Dashboard
   ------------------------------------------------------------
   One page where an operative signs in with their own card
   password (or the admin password) and manages their mission
   files: create, edit, delete. Every saved file automatically
   appears in the Mission Files section on the main menu.

   Sessions are shared with profile.html / project.html, so once
   unlocked here the editor pages open without re-entering the
   password (same tab).
   ============================================================ */

const $ = (id) => document.getElementById(id);

const ADMIN_SESSION_KEY = window.ANBU.adminSessionKey;
const ADMIN_PASS_KEY = "anbu-admin-pass";

const loginPanel = $("dash-login");
const loginInput = $("dash-password");
const btnUnlock = $("btn-dash-unlock");
const loginError = $("dash-error");

const dashView = $("dash-view");
const dashName = $("dash-name");
const dashSub = $("dash-sub");
const photoEl = $("dash-photo");
const rankEl = $("dash-rank");
const codenameEl = $("dash-codename");
const roleEl = $("dash-role");
const bioLineEl = $("dash-bio-line");

const btnNewProject = $("btn-new-project");
const btnMyProfile = $("btn-my-profile");
const btnLogout = $("btn-logout");

const adminSwitchRow = $("admin-switch-row");
const adminSwitch = $("admin-switch");

const projectGrid = $("dash-project-grid");

/* ---------- admin access-passwords panel ---------- */
const adminPasswordsSection = $("admin-passwords-section");
const adminPasswordsList = $("admin-passwords-list");
const adminPasswordsMsg = $("admin-passwords-msg");

/* ---------- squad news (dashboard-only posting) ---------- */
const newsForm = $("dash-news-form");
const newsText = $("dash-news-text");
const newsError = $("dash-news-error");
const newsSubmitBtn = $("btn-dash-news-post");
const dashNewsList = $("dash-news-list");
const dashNewsEmpty = $("dash-news-empty");

/* ---------- state ---------- */
let members = [];
let level = null; /* "owner" | "admin" */
let activeSlug = ""; /* whose files we are managing */

function ownerSessionKey(s) {
  return "anbu-owner-session-" + s;
}
function ownerPassKey(s) {
  return "anbu-owner-pass-" + s;
}

function escHtml(s) {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
}

/* ---------- type badges + quick actions ---------- */
const ICON_APP =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><line x1="10.5" y1="18.5" x2="13.5" y2="18.5" stroke="currentColor" stroke-width="1.6"/></svg>';
const ICON_WEB =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><ellipse cx="12" cy="12" rx="4" ry="9" fill="none" stroke="currentColor" stroke-width="1.6"/><line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="1.6"/></svg>';
const ICON_DOWNLOAD =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11m0 0l-4-4m4 4l4-4M4 20h16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
const ICON_LINK =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4L10 14M8 6H5a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1v-3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
const ICON_NEWS =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h13a1 1 0 011 1v10.5M18 16.5H6.2A2.2 2.2 0 004 18.7V8m0 10.7V8" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M20 8h-2v8.5a2 2 0 104 0V10a2 2 0 00-2-2z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
const ICON_TRASH =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m3 0l-.8 12.05a1 1 0 01-1 .95H7.8a1 1 0 01-1-.95L6 7m4 4v5m4-5v5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

function typeBadge(type) {
  if (type === "app") return `<span class="badge">${ICON_APP}App</span>`;
  if (type === "web") return `<span class="badge">${ICON_WEB}Web</span>`;
  return "";
}

function formatBytes(n) {
  if (!n) return "";
  if (n < 1024 * 1024) return Math.max(1, Math.round(n / 1024)) + " KB";
  return (n / (1024 * 1024)).toFixed(1) + " MB";
}

function hostOf(rawUrl) {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function extraActions(p) {
  const parts = [];
  if (p.type === "app" && Number(p.apkSize || 0) > 0) {
    parts.push(
      `<a class="btn" href="${window.ANBU.api.downloadUrl(activeSlug, p.id)}">${ICON_DOWNLOAD}Download</a>`
    );
  }
  if (p.type === "web" && p.linkUrl) {
    parts.push(
      `<a class="btn" href="${escHtml(p.linkUrl)}" target="_blank" rel="noopener">${ICON_LINK}Visit</a>`
    );
  }
  return parts.join("");
}

function authFields(slug) {
  if (level === "admin") {
    return { adminPassword: window.ANBU.getSession(ADMIN_PASS_KEY) || "" };
  }
  return { password: window.ANBU.getSession(ownerPassKey(slug)) || "" };
}

/* ---------- auto sign-in from an existing session ---------- */
function findExistingSession() {
  if (window.ANBU.getSession(ADMIN_SESSION_KEY) === "1") {
    return { level: "admin", slug: "" };
  }
  for (const m of window.MEMBERS || []) {
    if (window.ANBU.getSession(ownerSessionKey(m.slug)) === "1") {
      return { level: "owner", slug: m.slug };
    }
  }
  return null;
}

/* ---------- unlock flow ---------- */
async function tryUnlock(pw) {
  /* admin first (any valid slug works for the admin check) */
  for (const m of members) {
    try {
      const res = await window.ANBU.api.verify(m.slug, pw);
      if (res && res.level === "admin") {
        window.ANBU.setSession(ADMIN_SESSION_KEY, "1");
        window.ANBU.setSession(ADMIN_PASS_KEY, pw);
        return { level: "admin", slug: m.slug };
      }
      if (res && res.level === "owner") {
        window.ANBU.setSession(ownerSessionKey(m.slug), "1");
        window.ANBU.setSession(ownerPassKey(m.slug), pw);
        return { level: "owner", slug: m.slug };
      }
    } catch (e) {
      /* try next member */
    }
  }
  return null;
}

async function onUnlock() {
  const pw = loginInput.value.trim();
  if (!pw) return;

  btnUnlock.disabled = true;

  /* tell "server down" apart from "wrong password" */
  let online = true;
  try {
    await window.ANBU.api.health();
  } catch (e) {
    online = false;
  }

  if (!online) {
    btnUnlock.disabled = false;
    loginError.textContent =
      'Cannot reach the server. Run "npm start" in the project folder, then open http://localhost:3001/dashboard.html.';
    loginError.hidden = false;
    return;
  }

  const result = await tryUnlock(pw);
  btnUnlock.disabled = false;

  if (!result) {
    loginError.textContent = "Access denied. Wrong password.";
    loginError.hidden = false;
    return;
  }

  level = result.level;
  activeSlug = result.slug;
  openDashboard();
}

/* ---------- dashboard rendering ---------- */
function openDashboard() {
  loginPanel.hidden = true;
  dashView.hidden = false;
  loginError.hidden = true;
  loginInput.value = "";

  const me = members.find((m) => m.slug === activeSlug) || members[0];
  if (level === "owner" && me) {
    activeSlug = me.slug;
    dashName.textContent = me.name;
    dashSub.textContent = "Your war room. Upload and manage your mission files.";
    adminSwitchRow.hidden = true;
  } else if (level === "admin" && me) {
    dashName.textContent = "COMMAND";
    dashSub.textContent = "Admin access. Manage any operative's mission files.";
    adminSwitchRow.hidden = false;
    adminSwitch.innerHTML = members
      .map((m) => `<option value="${m.slug}">${escHtml(m.name)}</option>`)
      .join("");
    adminSwitch.value = activeSlug;
  }

  renderIdentity(me);
  btnMyProfile.href = `profile.html?member=${activeSlug}`;
  if (adminPasswordsSection) adminPasswordsSection.hidden = level !== "admin";
  if (level === "admin") loadPasswords();
  loadProjects();
  loadDashNews();
}

function renderIdentity(member) {
  if (!member) return;
  photoEl.src = member.photo;
  photoEl.alt = `Codename ${member.name}`;
  rankEl.textContent = member.rank;
  codenameEl.textContent = member.name;
  roleEl.textContent = member.role;
  bioLineEl.textContent =
    level === "admin"
      ? "Signed in as command. Rank and role stay locked to command edits."
      : "Signed in. Your uploads go live on the main menu instantly.";
}

async function loadProjects() {
  let list = [];
  try {
    list = await window.ANBU.api.listProjects(activeSlug);
  } catch (e) {
    /* leave empty on failure */
  }

  list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  projectGrid.innerHTML =
    list
      .map(
        (p) => `
      <div class="project-card dash-project">
        <div class="project-card-head">
          ${typeBadge(p.type)}
          <span class="project-card-title">${escHtml(p.name)}</span>
        </div>
        ${p.intro ? `<p class="project-card-intro">${escHtml(p.intro)}</p>` : ""}
        <span class="project-card-meta">${
          p.type === "app" && p.apkName
            ? `${escHtml(p.apkName)} (${formatBytes(p.apkSize)}) &middot; `
            : p.type === "web" && p.linkUrl
              ? `${escHtml(hostOf(p.linkUrl))} &middot; `
              : ""
        }Updated ${new Date(p.updatedAt || Date.now()).toLocaleDateString()}</span>
        <div class="dash-project-actions">
          <a class="btn" href="project.html?owner=${activeSlug}&id=${p.id}">Open</a>
          <a class="btn" href="project.html?owner=${activeSlug}&id=${p.id}&edit=1">Edit</a>
          <button class="btn btn--danger" type="button" data-delete="${p.id}" data-name="${escHtml(p.name)}">Delete</button>
        </div>
        ${extraActions(p) ? `<div class="dash-project-actions">${extraActions(p)}</div>` : ""}
      </div>`
      )
      .join("") +
    `<button class="project-card project-card--add" id="btn-add-dash" type="button">
       <span class="project-card-plus">+</span>
       <span class="project-card-addlabel">New Mission File</span>
     </button>`;

  projectGrid.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", () => onDelete(btn.dataset.delete, btn.dataset.name));
  });

  const addBtn = $("btn-add-dash");
  if (addBtn) addBtn.addEventListener("click", newProject);
}

function newProject() {
  window.location.href = `project.html?owner=${activeSlug}&new=1`;
}

async function onDelete(id, name) {
  if (!window.confirm(`Delete "${name}" permanently?`)) return;
  try {
    await window.ANBU.api.deleteProject(activeSlug, id, authFields(activeSlug));
  } catch (e) {
    window.alert(e && e.message ? e.message : "Could not delete.");
    return;
  }
  loadProjects();
}

/* ---------- admin: every operative's individual password ---------- */
function flashPasswordsMsg(text, isError) {
  if (!adminPasswordsMsg) return;
  adminPasswordsMsg.textContent = text;
  adminPasswordsMsg.style.color = isError ? "var(--red-bright)" : "";
  adminPasswordsMsg.hidden = false;
  setTimeout(() => {
    adminPasswordsMsg.hidden = true;
  }, 2600);
}

function randomPassword() {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return "anbu-" + out;
}

async function loadPasswords() {
  if (level !== "admin" || !adminPasswordsList) return;
  let passwords = {};
  try {
    const res = await window.ANBU.api.adminPasswords(authFields(activeSlug));
    passwords = (res && res.passwords) || {};
  } catch (e) {
    adminPasswordsList.innerHTML = "";
    return;
  }

  adminPasswordsList.innerHTML = members
    .map((m) => {
      const current = passwords[m.slug] || "—";
      return `
      <div class="password-row" data-slug="${escHtml(m.slug)}">
        <span class="password-name">${escHtml(m.name)}<span class="password-slug">${escHtml(m.slug)}</span></span>
        <code class="password-value">${escHtml(current)}</code>
        <input class="access-input password-input" type="text" placeholder="New password" autocomplete="off" />
        <button class="btn btn--primary" type="button" data-action="set">Set</button>
        <button class="btn btn--ghost" type="button" data-action="random" title="Generate a random password">Random</button>
      </div>`;
    })
    .join("");

  adminPasswordsList.querySelectorAll("[data-action='set']").forEach((btn) => {
    btn.addEventListener("click", () => onSetPassword(btn.closest(".password-row")));
  });
  adminPasswordsList.querySelectorAll("[data-action='random']").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = btn.closest(".password-row").querySelector(".password-input");
      input.value = randomPassword();
      input.focus();
    });
  });
}

async function onSetPassword(row) {
  const slug = row.dataset.slug;
  const input = row.querySelector(".password-input");
  const newPw = (input.value || "").trim();
  if (!newPw) {
    flashPasswordsMsg("Type a new password for this operative first.", true);
    input.focus();
    return;
  }
  const name = (members.find((m) => m.slug === slug) || {}).name || slug;
  try {
    await window.ANBU.api.changePassword(slug, {
      adminPassword: window.ANBU.getSession(ADMIN_PASS_KEY) || "",
      newPassword: newPw,
    });
    row.querySelector(".password-value").textContent = newPw;
    input.value = "";
    flashPasswordsMsg(`${name}: password set to ${newPw}.`);
  } catch (e) {
    flashPasswordsMsg((e && e.message) || "Could not set that password.", true);
  }
}

/* ---------- squad news: read + post + delete ---------- */
function newsTimeAgo(ts) {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return s + "s ago";
  const m = Math.round(s / 60);
  if (m < 60) return m + " min ago";
  const h = Math.round(m / 60);
  if (h < 24) return h + " h ago";
  return new Date(ts).toLocaleDateString();
}

function canDeleteNews(item) {
  return level === "admin" || item.owner === activeSlug;
}

function dashNewsCard(item) {
  const deletable = canDeleteNews(item);
  return `
    <article class="news-item" data-id="${escHtml(item.id)}">
      <div class="news-item-head">
        <span class="news-badge">${ICON_NEWS}</span>
        <span class="news-author">${escHtml(item.ownerName)}</span>
        ${item.ownerRank ? `<span class="news-rank">${escHtml(item.ownerRank)}</span>` : ""}
        <span class="news-time">${newsTimeAgo(item.createdAt || Date.now())}</span>
        ${deletable ? `<button class="news-delete" type="button" title="Delete this intel">${ICON_TRASH}</button>` : ""}
      </div>
      <p class="news-body">${escHtml(item.text)}</p>
    </article>`;
}

async function loadDashNews() {
  let items = [];
  try {
    items = await window.ANBU.api.listNews();
  } catch (e) {
    items = [];
  }
  if (dashNewsList) {
    dashNewsList.innerHTML = items.map(dashNewsCard).join("");
    dashNewsList.querySelectorAll(".news-delete").forEach((btn) => {
      btn.addEventListener("click", () => onDeleteNews(btn.closest(".news-item").dataset.id));
    });
  }
  if (dashNewsEmpty) dashNewsEmpty.hidden = items.length > 0;
}

async function onDeleteNews(id) {
  if (!window.confirm("Delete this intel permanently?")) return;
  try {
    await window.ANBU.api.deleteNews(id, authFields(activeSlug));
  } catch (e) {
    window.alert(e && e.message ? e.message : "Could not delete.");
    return;
  }
  loadDashNews();
}

async function onPostNews(ev) {
  ev.preventDefault();
  if (newsError) newsError.hidden = true;
  const text = (newsText.value || "").trim();
  if (!text) return;
  newsSubmitBtn.disabled = true;
  try {
    await window.ANBU.api.createNews(Object.assign({ text }, authFields(activeSlug)));
    newsText.value = "";
    loadDashNews();
  } catch (e) {
    if (newsError) {
      newsError.textContent = (e && e.message) || "Could not post.";
      newsError.hidden = false;
    }
  } finally {
    newsSubmitBtn.disabled = false;
  }
}

/* ---------- logout ---------- */
function logout() {
  if (level === "admin") {
    window.ANBU.clearSession(ADMIN_SESSION_KEY);
  } else {
    window.ANBU.clearSession(ownerSessionKey(activeSlug));
  }
  level = null;
  activeSlug = "";
  dashView.hidden = true;
  loginPanel.hidden = false;
}

/* ---------- wire up ---------- */
btnUnlock.addEventListener("click", onUnlock);
loginInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") onUnlock();
});
btnNewProject.addEventListener("click", newProject);
btnLogout.addEventListener("click", logout);
if (newsForm) newsForm.addEventListener("submit", onPostNews);

adminSwitch.addEventListener("change", () => {
  activeSlug = adminSwitch.value;
  const me = members.find((m) => m.slug === activeSlug);
  renderIdentity(me);
  btnMyProfile.href = `profile.html?member=${activeSlug}`;
  loadProjects();
  loadDashNews();
});

/* ---------- init ---------- */
(async function init() {
  try {
    members = await window.ANBU.api.listMembers();
  } catch (e) {
    members = [];
  }
  if (!members || !members.length) members = window.MEMBERS || [];

  const existing = findExistingSession();
  if (existing && members.length) {
    level = existing.level;
    activeSlug = existing.slug || members[0].slug;
    openDashboard();
  }
})();
