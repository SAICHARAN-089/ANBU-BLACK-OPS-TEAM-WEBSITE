/* ============================================================
   ANBU BLACK OPS — Dossier Rendering + Access-Controlled Editing
   ------------------------------------------------------------
   ?member=<slug> selects the operative. All data is loaded from
   and saved to the shared backend (/api/*), so edits are visible
   to everyone who visits the site.

   Access levels:
     - Admin  (password @820069): can edit EVERY field on any card
       (name, rank, role, one-liner, field report, photo) and set
       the card's password directly — no current password needed.
     - Owner  (the operative's own card password): can edit their
       name, one-liner, field report AND profile photo. Rank and
       role stay command-restricted.
     - Visitors without a password: read-only.

   Projects ("Mission Files") sit between the self-introduction
   and the field report. Everyone can view them; only the card's
   owner (with their password) or the admin can create / edit /
   delete them.
   ============================================================ */

const params = new URLSearchParams(window.location.search);
const slug = (params.get("member") || "").toLowerCase();
const base = (window.MEMBERS || []).find((m) => m.slug === slug) || null;

const ADMIN_PASS = "@820069";
const ADMIN_SESSION_KEY = window.ANBU.adminSessionKey;
const ADMIN_PASS_KEY = "anbu-admin-pass";
const OWNER_SESSION_KEY = (s) => "anbu-owner-session-" + s;
const OWNER_PASS_KEY = (s) => "anbu-owner-pass-" + s;

const $ = (id) => document.getElementById(id);

/* ---------- session helpers ---------- */
function adminActive() {
  return window.ANBU.getSession(ADMIN_SESSION_KEY) === "1";
}

function ownerActive() {
  return window.ANBU.getSession(OWNER_SESSION_KEY(slug)) === "1";
}

function adminPass() {
  return window.ANBU.getSession(ADMIN_PASS_KEY) || ADMIN_PASS;
}

function ownerPass() {
  return window.ANBU.getSession(OWNER_PASS_KEY(slug)) || "";
}

/* ---------- image handling ---------- */
const compressImage = (file, maxDim, quality) =>
  window.ANBU.compressImage(file, maxDim, quality);

/* ---------- rendering ---------- */
function applyMember(m) {
  if (!m) return;
  document.title = `ANBU BLACK OPS — ${m.name}`;
  $("dossier-name").textContent = m.name;
  $("dossier-accent").textContent = "BLACK OPS";
  $("dossier-photo").src = m.photo;
  $("dossier-photo").alt = `Codename ${m.name}`;
  $("dossier-rank").textContent = m.rank;
  $("dossier-codename").textContent = m.name;
  $("dossier-role").textContent = m.role;
  $("dossier-bio").textContent = m.bio;
  $("dossier-detail").innerHTML = window.Report.renderReport(m.detail);
  const socials = $("dossier-socials");
  if (socials) socials.innerHTML = socialButtons(m);
}

/* ---------- projects ---------- */
const ICON_APP =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><line x1="10.5" y1="18.5" x2="13.5" y2="18.5" stroke="currentColor" stroke-width="1.6"/></svg>';
const ICON_WEB =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><ellipse cx="12" cy="12" rx="4" ry="9" fill="none" stroke="currentColor" stroke-width="1.6"/><line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="1.6"/></svg>';
const ICON_DOWNLOAD =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11m0 0l-4-4m4 4l4-4M4 20h16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
const ICON_LINK =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4L10 14M8 6H5a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1v-3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
const ICON_LINKEDIN =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/><line x1="7.5" y1="10.2" x2="7.5" y2="16.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="7.5" cy="7.4" r="1.05" fill="currentColor"/><path d="M11.4 16.8v-4a2.4 2.4 0 014.8 0v4M11.4 10.2v1.9" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
const ICON_GITHUB =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8a9.2 9.2 0 00-2.91 17.93c.46.08.63-.2.63-.44v-1.72c-2.56.56-3.1-1.1-3.1-1.1-.42-1.07-1.03-1.36-1.03-1.36-.84-.57.06-.56.06-.56.93.07 1.42.96 1.42.96.83 1.42 2.17 1.01 2.7.77.08-.6.32-1.01.59-1.24-2.04-.23-4.19-1.02-4.19-4.55 0-1 .36-1.82.95-2.47-.1-.23-.41-1.17.09-2.43 0 0 .78-.25 2.55.95a8.86 8.86 0 014.64 0c1.77-1.2 2.55-.95 2.55-.95.5 1.26.19 2.2.09 2.43.59.65.95 1.47.95 2.47 0 3.54-2.16 4.32-4.21 4.54.33.29.62.85.62 1.71v2.53c0 .24.17.53.64.44A9.2 9.2 0 0012 2.8z" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';
const ICON_MAIL =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M4 7l8 6 8-6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

/* ---------- social link buttons (LinkedIn / GitHub / Email) ---------- */
function socialButtons(m) {
  const parts = [];
  if (m.linkedin) {
    parts.push(
      `<a class="social-btn social-btn--linkedin" href="${window.Report.escHtml(m.linkedin)}" target="_blank" rel="noopener" title="LinkedIn">${ICON_LINKEDIN}<span>LinkedIn</span></a>`
    );
  }
  if (m.github) {
    parts.push(
      `<a class="social-btn social-btn--github" href="${window.Report.escHtml(m.github)}" target="_blank" rel="noopener" title="GitHub">${ICON_GITHUB}<span>GitHub</span></a>`
    );
  }
  if (m.email) {
    parts.push(
      `<a class="social-btn social-btn--email" href="mailto:${window.Report.escHtml(m.email)}" title="Email">${ICON_MAIL}<span>Email</span></a>`
    );
  }
  return parts.length ? parts.join("") : "";
}

function typeBadge(type) {
  if (type === "app") return `<span class="badge">${ICON_APP}App</span>`;
  if (type === "web") return `<span class="badge">${ICON_WEB}Web</span>`;
  return "";
}

function hostOf(rawUrl) {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function projectActions(p) {
  const parts = [];
  if (p.type === "app" && Number(p.apkSize || 0) > 0) {
    parts.push(
      `<a class="btn card-action-btn" href="${window.ANBU.api.downloadUrl(slug, p.id)}">${ICON_DOWNLOAD}Download APK</a>`
    );
  }
  if (p.type === "web" && p.linkUrl) {
    parts.push(
      `<a class="btn card-action-btn" href="${window.Report.escHtml(p.linkUrl)}" target="_blank" rel="noopener">${ICON_LINK}Visit Site</a>`
    );
  }
  return parts.length
    ? `<div class="dash-project-actions card-actions">${parts.join("")}</div>`
    : "";
}

function renderProjects(projects) {
  const grid = $("project-grid");
  if (!grid) return;
  const cards = projects
    .slice()
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .map(
      (p) => `
      <article class="project-card">
        <a class="card-cover-link" href="project.html?owner=${slug}&id=${p.id}">
          <div class="project-card-head">
            ${typeBadge(p.type)}
            <span class="project-card-title">${window.Report.escHtml(p.name)}</span>
          </div>
          ${p.intro ? `<p class="project-card-intro">${window.Report.escHtml(p.intro)}</p>` : ""}
          <span class="project-card-meta">${
            p.type === "app" && p.apkName
              ? `${window.Report.escHtml(p.apkName)} &middot; `
              : p.type === "web" && p.linkUrl
                ? `${window.Report.escHtml(hostOf(p.linkUrl))} &middot; `
                : ""
          }${new Date(p.updatedAt || Date.now()).toLocaleDateString()}</span>
        </a>
        ${projectActions(p)}
      </article>`
    )
    .join("");

  grid.innerHTML =
    cards +
    `<button class="project-card project-card--add" id="btn-add-project" type="button" title="Add project">
       <span class="project-card-plus">+</span>
       <span class="project-card-addlabel">Add Project</span>
     </button>`;

  const addBtn = $("btn-add-project");
  if (addBtn) {
    addBtn.addEventListener("click", onAddProject);
  }
}

function onAddProject() {
  const go = () => {
    window.location.href = `project.html?owner=${slug}&new=1`;
  };
  if (adminActive() || ownerActive()) {
    go();
  } else {
    showAccess("project", go);
  }
}

if (!base) {
  $("dossier-accent").textContent = "FILE NOT FOUND";
  $("dossier-name").textContent = "ANBU";
  $("dossier-photo").alt = "No operative found";
} else {
  /* ---------- element refs ---------- */
  const rankEl = $("dossier-rank");
  const nameEl = $("dossier-codename");
  const roleEl = $("dossier-role");
  const bioEl = $("dossier-bio");
  const detailEl = $("dossier-detail");
  const descEl = $("dossier-desc");
  const reportEditor = $("report-editor");

  const btnEdit = $("btn-edit");
  const btnEditReport = $("btn-edit-report");
  const btnSave = $("btn-save");
  const btnCancel = $("btn-cancel");
  const btnReset = $("btn-reset");

  const photoControls = $("photo-controls");
  const btnPhoto = $("btn-photo");
  const photoFile = $("photo-file");

  const accessPanel = $("access-panel");
  const accessInput = $("access-password");
  const btnUnlock = $("btn-unlock");
  const btnUnlockCancel = $("btn-unlock-cancel");
  const accessError = $("access-error");

  const editHint = $("edit-hint");

  const passPanel = $("pass-panel");
  const passCurrentLine = $("pass-current-line");
  const passCurrent = $("pass-current");
  const passNew = $("pass-new");
  const btnPassSave = $("btn-pass-save");
  const passError = $("pass-error");
  const passOk = $("pass-ok");

  let mode = null;
  let pendingScope = "profile";
  let pendingPhoto = null;
  let pendingCallback = null;
  let member = null;

  /* ---------- load + render ---------- */
  async function loadMember() {
    member = (await window.ANBU.api.getMember(slug)) || base;
    applyMember(member);
  }

  (async function init() {
    await loadMember();
    await loadProjects();
  })();

  async function loadProjects() {
    const projects = await window.ANBU.api.listProjects(slug);
    renderProjects(projects);
  }

  /* ---------- edit mode management ---------- */
  function setEditable(el, on) {
    el.contentEditable = on ? "true" : "false";
    el.classList.toggle("editable", on);
  }

  function enterEdit(scope, level) {
    mode = { scope, level };
    const isAdmin = level === "admin";
    const isProfile = scope === "profile";

    setEditable(nameEl, isProfile);
    setEditable(bioEl, isProfile);
    setEditable(rankEl, isProfile && isAdmin);
    setEditable(roleEl, isProfile && isAdmin);

    rankEl.classList.toggle("is-locked", !(isProfile && isAdmin));
    roleEl.classList.toggle("is-locked", !(isProfile && isAdmin));

    if (isProfile) {
      reportEditor.hidden = true;
      const linksEditor = $("links-editor");
      if (linksEditor) {
        linksEditor.hidden = false;
        $("edit-linkedin").value = member.linkedin || "";
        $("edit-github").value = member.github || "";
        $("edit-email").value = member.email || "";
      }
    } else {
      const linksEditor = $("links-editor");
      if (linksEditor) linksEditor.hidden = true;
      descEl.value = member.detail || "";
      detailEl.innerHTML = window.Report.renderReport(descEl.value);
      reportEditor.hidden = false;
    }

    pendingPhoto = null;
    photoControls.hidden = !isProfile;
    photoFile.value = "";

    editHint.textContent = isProfile
      ? isAdmin
        ? "Profile access. Name, rank, role, one-liner, LinkedIn/GitHub and photo are editable."
        : "Profile access. Name, one-liner, LinkedIn/GitHub and photo are editable. Rank and role are command-restricted."
      : "Report access. Write the field report markup in the description box below.";

    editHint.hidden = false;

    passCurrentLine.hidden = !isAdmin;
    if (isAdmin) {
      passCurrentLine.textContent = `Current password: ${ownerPass() || "—"}`;
      window.ANBU.api
        .currentPassword(slug, { adminPassword: adminPass() })
        .then((res) => {
          if (res && res.password) {
            passCurrentLine.textContent = `Current password: ${res.password}`;
          }
        })
        .catch(() => {});
    }
    passCurrent.hidden = isAdmin;
    passNew.value = "";
    passError.hidden = true;
    passOk.hidden = true;
    passPanel.hidden = false;

    btnEdit.hidden = true;
    btnEditReport.hidden = true;
    btnSave.hidden = false;
    btnCancel.hidden = false;
    btnReset.hidden = false;
    accessPanel.hidden = true;
    accessInput.value = "";
    accessError.hidden = true;
  }

  function exitEdit() {
    mode = null;
    [rankEl, nameEl, roleEl, bioEl].forEach((el) => setEditable(el, false));
    rankEl.classList.remove("is-locked");
    roleEl.classList.remove("is-locked");
    const linksEditor = $("links-editor");
    if (linksEditor) linksEditor.hidden = true;
    editHint.hidden = true;
    passPanel.hidden = true;
    photoControls.hidden = true;
    reportEditor.hidden = true;
    pendingPhoto = null;
    btnEdit.hidden = false;
    btnEditReport.hidden = false;
    btnSave.hidden = true;
    btnCancel.hidden = true;
    btnReset.hidden = true;
  }

  /* ---------- unlock ---------- */
  function showAccess(scope, cb) {
    pendingScope = scope;
    pendingCallback = cb || null;
    accessPanel.hidden = false;
    accessError.hidden = true;
    accessInput.value = "";
    accessInput.focus();
  }

  async function tryUnlock() {
    const pw = accessInput.value;
    let level = null;
    try {
      const res = await window.ANBU.api.verify(slug, pw);
      level = res.level;
    } catch (e) {
      accessError.hidden = false;
      return;
    }

    if (level === "admin") {
      window.ANBU.setSession(ADMIN_SESSION_KEY, "1");
      window.ANBU.setSession(ADMIN_PASS_KEY, pw);
      if (pendingCallback) {
        pendingCallback();
        return;
      }
      enterEdit(pendingScope, "admin");
    } else if (level === "owner") {
      window.ANBU.setSession(OWNER_SESSION_KEY(slug), "1");
      window.ANBU.setSession(OWNER_PASS_KEY(slug), pw);
      if (pendingCallback) {
        pendingCallback();
        return;
      }
      enterEdit(pendingScope, "owner");
    } else {
      accessError.hidden = false;
    }
  }

  btnEdit.addEventListener("click", () => {
    if (adminActive()) enterEdit("profile", "admin");
    else if (ownerActive()) enterEdit("profile", "owner");
    else showAccess("profile");
  });

  btnEditReport.addEventListener("click", () => {
    if (adminActive()) enterEdit("report", "admin");
    else if (ownerActive()) enterEdit("report", "owner");
    else showAccess("report");
  });

  btnUnlock.addEventListener("click", tryUnlock);
  accessInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") tryUnlock();
  });

  btnUnlockCancel.addEventListener("click", () => {
    accessPanel.hidden = true;
    accessError.hidden = true;
    accessInput.value = "";
    pendingScope = "profile";
    pendingCallback = null;
  });

  /* ---------- profile photo (owner + admin) ---------- */
  btnPhoto.addEventListener("click", () => photoFile.click());

  photoFile.addEventListener("change", async () => {
    const file = photoFile.files && photoFile.files[0];
    if (!file) return;
    try {
      pendingPhoto = await compressImage(file, 600, 0.82);
      $("dossier-photo").src = pendingPhoto;
    } catch (e) {
      window.alert(e && e.message ? e.message : "Could not process that image.");
      photoFile.value = "";
    }
  });

  /* live preview: typing markup in the description box re-renders the report */
  descEl.addEventListener("input", () => {
    detailEl.innerHTML = window.Report.renderReport(descEl.value);
  });

  /* ---------- save / cancel / reset ---------- */
  btnSave.addEventListener("click", async () => {
    if (!mode) return;
    const isAdmin = mode.level === "admin";
    const auth = isAdmin ? { adminPassword: adminPass() } : { password: ownerPass() };

    const fields = Object.assign({}, auth);
    if (mode.scope === "profile") {
      fields.name = nameEl.textContent.trim() || member.name;
      fields.bio = bioEl.textContent.trim() || member.bio;
      fields.linkedin = ($("edit-linkedin").value || "").trim();
      fields.github = ($("edit-github").value || "").trim();
      fields.email = ($("edit-email").value || "").trim();
      if (isAdmin) {
        fields.rank = rankEl.textContent.trim() || member.rank;
        fields.role = roleEl.textContent.trim() || member.role;
      }
      if (pendingPhoto) fields.photo = pendingPhoto;
    } else {
      fields.detail = descEl.value.trim() || member.detail;
    }

    try {
      member = await window.ANBU.api.updateMember(slug, fields);
    } catch (e) {
      window.alert(e && e.message ? e.message : "Could not save. Try again.");
      return;
    }
    applyMember(member);
    exitEdit();
  });

  btnCancel.addEventListener("click", () => {
    applyMember(member);
    exitEdit();
  });

  btnReset.addEventListener("click", async () => {
    if (mode && mode.level === "admin") {
      /* admin reset = restore the seed values for the editable fields */
      const fields = {
        adminPassword: adminPass(),
        name: base.name,
        bio: base.bio,
        rank: base.rank,
        role: base.role,
        detail: base.detail,
        photo: base.photo,
      };
      try {
        member = await window.ANBU.api.updateMember(slug, fields);
      } catch (e) {
        window.alert(e && e.message ? e.message : "Could not reset.");
        return;
      }
      applyMember(member);
      exitEdit();
    } else if (mode && mode.scope === "report") {
      descEl.value = base.detail;
      detailEl.innerHTML = window.Report.renderReport(descEl.value);
    } else if (mode) {
      nameEl.textContent = base.name;
      bioEl.textContent = base.bio;
      $("edit-linkedin").value = base.linkedin || "";
      $("edit-github").value = base.github || "";
      $("edit-email").value = base.email || "";
      $("dossier-photo").src = base.photo;
    }
  });

  /* ---------- password management ---------- */
  btnPassSave.addEventListener("click", async () => {
    const newPw = passNew.value.trim();
    if (!newPw) return;

    try {
      if (mode.level === "admin") {
        await window.ANBU.api.changePassword(slug, {
          adminPassword: adminPass(),
          newPassword: newPw,
        });
        window.ANBU.setSession(OWNER_PASS_KEY(slug), newPw);
        passCurrentLine.textContent = `Current password: ${newPw}`;
      } else {
        /* Prefer the current password the operative actually typed —
           the session value can be stale (e.g. an admin reset the
           card elsewhere), which would otherwise fail with "Access
           denied" even for the correct current password. */
        const currentPw = (passCurrent.value || "").trim() || ownerPass();
        if (!currentPw) {
          passError.hidden = false;
          passOk.hidden = true;
          return;
        }
        await window.ANBU.api.changePassword(slug, {
          password: currentPw,
          newPassword: newPw,
        });
        window.ANBU.setSession(OWNER_PASS_KEY(slug), newPw);
      }
      passNew.value = "";
      passError.hidden = true;
      passOk.hidden = false;
      setTimeout(() => {
        passOk.hidden = true;
      }, 2200);
    } catch (e) {
      passError.hidden = false;
      passOk.hidden = true;
    }
  });
}
