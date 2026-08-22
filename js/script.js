/* ============================================================
   ANBU BLACK OPS — Operative Roster Rendering
   ------------------------------------------------------------
   Member data is loaded from the shared backend (/api/members)
   so every edit made by any operative is visible to everyone
   who visits the site. Falls back to the bundled seed data
   (js/members.js) only when the backend is unreachable.
   ============================================================ */

const grid = document.getElementById("team-grid");
const homeProjectGrid = document.getElementById("home-project-grid");
const homeProjectsEmpty = document.getElementById("home-projects-empty");

function escHtml(s) {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
}

function memberCard(member) {
  return `
    <a class="card-link" href="profile.html?member=${member.slug}" aria-label="View profile of ${member.name}">
    <article class="card">
      <div class="card-photo">
        <img
          src="${member.photo}"
          alt="Codename ${member.name} — placeholder photo"
          loading="lazy"
        />
      </div>
      <div class="card-body">
        <p class="rank">${member.rank}</p>
        <h3 class="codename">${member.name}</h3>
        <p class="role">${member.role}</p>
        <p class="bio">${member.bio}</p>
      </div>
    </article>
    </a>`;
}

function renderRoster(members) {
  if (!grid) return;
  grid.innerHTML = members.map((m) => memberCard(m)).join("");

  const cards = grid.querySelectorAll(".card");
  cards.forEach((card, i) => {
    card.style.transitionDelay = `${(i % 3) * 90}ms`;
  });

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in-view");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    cards.forEach((card) => observer.observe(card));
  } else {
    cards.forEach((card) => card.classList.add("in-view"));
  }
}

/* ---------- Mission Files section (all uploaded projects) ---------- */
const ICON_APP =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><line x1="10.5" y1="18.5" x2="13.5" y2="18.5" stroke="currentColor" stroke-width="1.6"/></svg>';
const ICON_WEB =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><ellipse cx="12" cy="12" rx="4" ry="9" fill="none" stroke="currentColor" stroke-width="1.6"/><line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="1.6"/></svg>';
const ICON_DOWNLOAD =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11m0 0l-4-4m4 4l4-4M4 20h16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
const ICON_LINK =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4L10 14M8 6H5a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1v-3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';

function typeBadge(type) {
  if (type === "app") {
    return `<span class="badge">${ICON_APP}App</span>`;
  }
  if (type === "web") {
    return `<span class="badge">${ICON_WEB}Web</span>`;
  }
  return "";
}

function projectActions(p) {
  const parts = [];
  if (p.type === "app" && Number(p.apkSize || 0) > 0) {
    parts.push(
      `<a class="btn card-action-btn" href="${window.ANBU.api.downloadUrl(p.owner, p.id)}">${ICON_DOWNLOAD}Download APK</a>`
    );
  }
  if (p.type === "web" && p.linkUrl) {
    parts.push(
      `<a class="btn card-action-btn" href="${escHtml(p.linkUrl)}" target="_blank" rel="noopener">${ICON_LINK}Visit Site</a>`
    );
  }
  return parts.length
    ? `<div class="dash-project-actions card-actions">${parts.join("")}</div>`
    : "";
}

function hostOf(rawUrl) {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function homeProjectCard(project, member) {
  const ownerName = member ? member.name : String(project.owner || "").toUpperCase();
  const ownerRank = member && member.rank ? member.rank : "";
  return `
    <article class="project-card project-card--home">
      <a class="card-cover-link" href="project.html?owner=${project.owner}&id=${project.id}">
        <div class="project-card-head">
          ${typeBadge(project.type)}
          <span class="project-card-title">${escHtml(project.name)}</span>
        </div>
        ${project.intro ? `<p class="project-card-intro">${escHtml(project.intro)}</p>` : ""}
        <p class="project-card-owner">
          <span class="project-card-owner-name">${escHtml(ownerName)}</span>
          ${ownerRank ? `<span class="project-card-owner-rank">${escHtml(ownerRank)}</span>` : ""}
        </p>
        <span class="project-card-meta">${
          project.type === "app" && project.apkName
            ? `${escHtml(project.apkName)} &middot; `
            : project.type === "web" && project.linkUrl
              ? `${escHtml(hostOf(project.linkUrl))} &middot; `
              : ""
        }Updated ${new Date(project.updatedAt || Date.now()).toLocaleDateString()}</span>
      </a>
      ${projectActions(project)}
    </article>`;
}

async function renderHomeProjects(members) {
  if (!homeProjectGrid) return;

  let all = [];
  for (const m of members) {
    try {
      const list = await window.ANBU.api.listProjects(m.slug);
      all = all.concat(list.map((p) => ({ project: p, member: m })));
    } catch (e) {
      /* skip this operative's projects on failure */
    }
  }

  all.sort((a, b) => (b.project.updatedAt || 0) - (a.project.updatedAt || 0));

  homeProjectGrid.innerHTML = all.map((x) => homeProjectCard(x.project, x.member)).join("");
  if (homeProjectsEmpty) homeProjectsEmpty.hidden = all.length > 0;
}

/* ---------- Command Directory social buttons ---------- */
const ICON_LINKEDIN =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/><line x1="7.5" y1="10.2" x2="7.5" y2="16.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="7.5" cy="7.4" r="1.05" fill="currentColor"/><path d="M11.4 16.8v-4a2.4 2.4 0 014.8 0v4M11.4 10.2v1.9" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
const ICON_GITHUB =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8a9.2 9.2 0 00-2.91 17.93c.46.08.63-.2.63-.44v-1.72c-2.56.56-3.1-1.1-3.1-1.1-.42-1.07-1.03-1.36-1.03-1.36-.84-.57.06-.56.06-.56.93.07 1.42.96 1.42.96.83 1.42 2.17 1.01 2.7.77.08-.6.32-1.01.59-1.24-2.04-.23-4.19-1.02-4.19-4.55 0-1 .36-1.82.95-2.47-.1-.23-.41-1.17.09-2.43 0 0 .78-.25 2.55.95a8.86 8.86 0 014.64 0c1.77-1.2 2.55-.95 2.55-.95.5 1.26.19 2.2.09 2.43.59.65.95 1.47.95 2.47 0 3.54-2.16 4.32-4.21 4.54.33.29.62.85.62 1.71v2.53c0 .24.17.53.64.44A9.2 9.2 0 0012 2.8z" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';
const ICON_MAIL =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M4 7l8 6 8-6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

function contactSocialButtons(member) {
  const parts = [];
  if (member.linkedin) {
    parts.push(
      `<a class="social-btn social-btn--linkedin" href="${escHtml(member.linkedin)}" target="_blank" rel="noopener" title="${escHtml(member.name)} on LinkedIn">${ICON_LINKEDIN}<span>LinkedIn</span></a>`
    );
  }
  if (member.github) {
    parts.push(
      `<a class="social-btn social-btn--github" href="${escHtml(member.github)}" target="_blank" rel="noopener" title="${escHtml(member.name)} on GitHub">${ICON_GITHUB}<span>GitHub</span></a>`
    );
  }
  if (member.email) {
    parts.push(
      `<a class="social-btn social-btn--email" href="mailto:${escHtml(member.email)}" title="Email ${escHtml(member.name)}">${ICON_MAIL}<span>Email</span></a>`
    );
  }
  return parts.join("");
}

function renderContactSocials(members) {
  document.querySelectorAll(".contact-card[data-member]").forEach((card) => {
    const slot = card.querySelector(".contact-socials");
    if (!slot) return;
    const member = members.find((m) => m.slug === card.dataset.member);
    slot.innerHTML = member ? contactSocialButtons(member) : "";
  });
}

/* ---------- Squad News (floating icon -> read-only intel feed)
   Reading is open to every visitor; posting and deleting news
   happens in the operative dashboard only. ---------- */
const ICON_NEWS =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h13a1 1 0 011 1v10.5M18 16.5H6.2A2.2 2.2 0 004 18.7V8m0 10.7V8" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M20 8h-2v8.5a2 2 0 104 0V10a2 2 0 00-2-2z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';

const newsFab = document.getElementById("news-fab");
const newsFabDot = document.getElementById("news-fab-dot");
const newsFabCount = document.getElementById("news-fab-count");
const newsBackdrop = document.getElementById("news-modal-backdrop");
const newsCloseBtn = document.getElementById("news-close");
const newsListEl = document.getElementById("news-list");
const newsEmptyEl = document.getElementById("news-empty");

/* notification dot on the floating icon — visible to every visitor */
async function loadNewsBadge() {
  try {
    const meta = await window.ANBU.api.newsMeta();
    const has = !!(meta && Number(meta.count) > 0);
    if (newsFabDot) newsFabDot.hidden = !has;
    if (newsFabCount) {
      newsFabCount.textContent = has ? String(meta.count > 9 ? "9+" : meta.count) : "";
      newsFabCount.hidden = !has;
    }
  } catch (e) {
    /* backend down — leave the icon clean */
  }
}

function timeAgo(ts) {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return s + "s ago";
  const m = Math.round(s / 60);
  if (m < 60) return m + " min ago";
  const h = Math.round(m / 60);
  if (h < 24) return h + " h ago";
  return new Date(ts).toLocaleDateString();
}

function newsCard(item) {
  return `
    <article class="news-item">
      <div class="news-item-head">
        <span class="news-badge">${ICON_NEWS}</span>
        <span class="news-author">${escHtml(item.ownerName)}</span>
        ${item.ownerRank ? `<span class="news-rank">${escHtml(item.ownerRank)}</span>` : ""}
        <span class="news-time">${timeAgo(item.createdAt || Date.now())}</span>
      </div>
      <p class="news-body">${escHtml(item.text)}</p>
    </article>`;
}

function renderNews(items) {
  if (!newsListEl) return;
  newsListEl.innerHTML = items.map(newsCard).join("");
  if (newsEmptyEl) newsEmptyEl.hidden = items.length > 0;
}

async function loadNewsFeed() {
  if (!newsListEl) return;
  let items = [];
  try {
    items = await window.ANBU.api.listNews();
  } catch (e) {
    items = [];
  }
  renderNews(items || []);
}

function openNewsModal() {
  if (!newsBackdrop) return;
  newsBackdrop.hidden = false;
  if (document.body) document.body.style.overflow = "hidden";
  loadNewsFeed();
}

function closeNewsModal() {
  if (!newsBackdrop) return;
  newsBackdrop.hidden = true;
  if (document.body) document.body.style.overflow = "";
}

if (newsFab) newsFab.addEventListener("click", openNewsModal);
if (newsCloseBtn) newsCloseBtn.addEventListener("click", closeNewsModal);
if (newsBackdrop) {
  newsBackdrop.addEventListener("click", (ev) => {
    if (ev.target === newsBackdrop) closeNewsModal();
  });
}
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape") closeNewsModal();
});

(async function init() {
  let members = window.MEMBERS || [];
  try {
    members = await window.ANBU.api.listMembers();
  } catch (e) {
    /* backend unreachable — keep the bundled seed data */
  }
  if (members && members.length) renderRoster(members);
  else if (window.MEMBERS && window.MEMBERS.length) renderRoster(window.MEMBERS);

  const activeMembers = members && members.length ? members : window.MEMBERS || [];
  renderHomeProjects(activeMembers);
  renderContactSocials(activeMembers);
  loadNewsBadge();
})();
