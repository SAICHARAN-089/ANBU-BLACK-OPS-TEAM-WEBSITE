/* ============================================================
   ANBU BLACK OPS — Mission File (project) viewer + editor
   ------------------------------------------------------------
   ?owner=<slug>&id=<projectId> opens an existing mission file.
   ?owner=<slug>&new=1 opens a blank mission file for the owner.

   - Everyone can view a mission file.
   - Only the card's owner (with their password) or the admin can
     create, edit, or delete it. Passwords are verified by the
     backend on every save.
   - The report editor embeds images with an alignment markup:
     ![left|caption](dataurl) / ![right|...] / ![center|...] /
     ![full|...]. The alignment tokens live in the report markup
     itself, exactly like the field report.
   ============================================================ */

const params = new URLSearchParams(window.location.search);
const owner = (params.get("owner") || "").toLowerCase();
const projectId = params.get("id") || "";
const isNew = params.get("new") === "1";

const ADMIN_SESSION_KEY = window.ANBU.adminSessionKey;
const ADMIN_PASS_KEY = "anbu-admin-pass";
const OWNER_SESSION_KEY = "anbu-owner-session-" + owner;
const OWNER_PASS_KEY = "anbu-owner-pass-" + owner;

const $ = (id) => document.getElementById(id);

/* ---------- session helpers ---------- */
function adminActive() {
  return window.ANBU.getSession(ADMIN_SESSION_KEY) === "1";
}

function ownerActive() {
  return window.ANBU.getSession(OWNER_SESSION_KEY) === "1";
}

function authFields() {
  if (adminActive()) {
    return { adminPassword: window.ANBU.getSession(ADMIN_PASS_KEY) || "@820069" };
  }
  return { password: window.ANBU.getSession(OWNER_PASS_KEY) || "" };
}

/* ---------- element refs ---------- */
const titleEl = $("project-title");
const ownerLine = $("project-owner");
const introEl = $("project-intro");
const introEditor = $("intro-editor");
const introInput = $("project-intro-input");
const reportEl = $("project-report");
const reportEditor = $("report-editor");
const reportInput = $("project-report-input");
const reportScroll = $("project-report-scroll");
const backLink = $("project-back");

const btnEdit = $("btn-edit-project");
const btnSave = $("btn-save-project");
const btnCancel = $("btn-cancel-project");
const btnDelete = $("btn-delete-project");

const accessPanel = $("access-panel");
const accessInput = $("access-password");
const btnUnlock = $("btn-unlock");
const btnUnlockCancel = $("btn-unlock-cancel");
const accessError = $("access-error");
const editHint = $("edit-hint");

const btnAddImage = $("btn-add-image");
const imageAlign = $("image-align");
const imageCaption = $("image-caption");
const imageFile = $("image-file");

/* type / target controls */
const typeBlock = $("type-block");
const typePicker = $("type-picker");
const typeBtns = Array.prototype.slice.call(typePicker.querySelectorAll(".type-btn"));
const apkEditor = $("apk-editor");
const apkFile = $("apk-file");
const apkStatus = $("apk-status");
const webEditor = $("web-editor");
const webUrl = $("web-url");
const webUrlError = $("web-url-error");

/* viewer extras */
const typeBadge = $("project-type-badge");
const btnDownloadApk = $("btn-download-apk");
const btnVisitWeb = $("btn-visit-web");

let project = null;
let editing = false;
let pendingAction = "view";

/* app / web target state */
let pendingType = "";
let pendingApkDataUrl = null;
let pendingApkName = "";

const MAX_APK_BYTES = 250 * 1024 * 1024;

function escHtml(s) {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
}

function normalizeLink(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const withProto = /^https?:\/\//i.test(s) ? s : "https://" + s;
  try {
    return new URL(withProto).href;
  } catch {
    return "";
  }
}

function formatBytes(n) {
  if (!n) return "0 MB";
  if (n < 1024 * 1024) return Math.max(1, Math.round(n / 1024)) + " KB";
  return (n / (1024 * 1024)).toFixed(1) + " MB";
}

/* treat placeholder titles as empty so uploads can auto-name them */
const DEFAULT_TITLES = ["new mission", "untitled", "untitled project", "untitled mission"];

function titleIsDefault() {
  const t = titleEl.textContent.trim().toLowerCase();
  return !t || DEFAULT_TITLES.includes(t);
}

function hostOf(rawUrl) {
  try {
    return new URL(normalizeLink(rawUrl)).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

/* ---------- rendering ---------- */
function renderProject() {
  if (!project) return;
  const name = project.name || "UNTITLED";
  document.title = `ANBU BLACK OPS — ${name}`;
  titleEl.textContent = name;
  ownerLine.textContent = `Filed under ${String(owner).toUpperCase()}.`;
  introEl.textContent = project.intro || "No introduction.";
  reportEl.innerHTML = window.Report.renderReport(project.report);
  backLink.href = `profile.html?member=${owner}`;

  /* type badge + download / visit actions */
  const type = project.type === "app" || project.type === "web" ? project.type : "";
  if (typeBadge) {
    if (type) {
      typeBadge.textContent = type === "app" ? "App" : "Website";
      typeBadge.hidden = false;
    } else {
      typeBadge.hidden = true;
    }
  }

  if (btnDownloadApk) {
    const hasApk = type === "app" && Number(project.apkSize || 0) > 0;
    btnDownloadApk.hidden = !hasApk;
    if (hasApk) {
      btnDownloadApk.href = window.ANBU.api.downloadUrl(owner, project.id);
    }
  }

  if (btnVisitWeb) {
    const hasLink = type === "web" && !!project.linkUrl;
    btnVisitWeb.hidden = !hasLink;
    if (hasLink) {
      btnVisitWeb.href = project.linkUrl;
    }
  }
}

function setEditing(on) {
  editing = on;
  titleEl.contentEditable = on ? "true" : "false";
  titleEl.classList.toggle("editable", on);

  introEditor.hidden = !on;
  reportEditor.hidden = !on;
  introEl.hidden = on;
  reportScroll.hidden = on;
  typeBlock.hidden = !on;

  btnEdit.hidden = on;
  btnSave.hidden = !on;
  btnCancel.hidden = !on;
  btnDelete.hidden = !on;
  editHint.hidden = !on;
  accessPanel.hidden = true;

  /* viewer-only actions stay visible while editing */
  if (btnDownloadApk && editing) btnDownloadApk.hidden = true;
  if (btnVisitWeb && editing) btnVisitWeb.hidden = true;

  if (on) {
    introInput.value = project.intro || "";
    reportInput.value = project.report || "";
    titleEl.textContent = project.name || "UNTITLED";

    pendingType = project.type || "";
    pendingApkDataUrl = null;
    pendingApkName = "";
    setType(pendingType);
    webUrl.value = project.linkUrl || "";
    webUrlError.hidden = true;
    apkStatus.textContent = project.apkName
      ? `Current APK: ${project.apkName} (${formatBytes(project.apkSize)}). Choose a file to replace it.`
      : "";

    editHint.textContent =
      "Edit mode. Pick the project type, change the title, introduction and report below. Save to publish for everyone.";
    setTimeout(() => reportInput.focus(), 0);
  }
}

function setType(t) {
  pendingType = t;
  typeBtns.forEach((b) => b.classList.toggle("is-active", b.dataset.type === t));
  apkEditor.hidden = t !== "app";
  webEditor.hidden = t !== "web";
}

/* ---------- unlock ---------- */
function showAccess(cb) {
  pendingAction = cb || "view";
  accessPanel.hidden = false;
  accessError.hidden = true;
  accessInput.value = "";
  accessInput.focus();
}

async function tryUnlock() {
  const pw = accessInput.value;
  let level = null;
  try {
    const res = await window.ANBU.api.verify(owner, pw);
    level = res.level;
  } catch (e) {
    accessError.hidden = false;
    return;
  }

  if (level === "admin") {
    window.ANBU.setSession(ADMIN_SESSION_KEY, "1");
    window.ANBU.setSession(ADMIN_PASS_KEY, pw);
  } else if (level === "owner") {
    window.ANBU.setSession(OWNER_SESSION_KEY, "1");
    window.ANBU.setSession(OWNER_PASS_KEY, pw);
  } else {
    accessError.hidden = false;
    return;
  }

  if (pendingAction === "create") {
    createBlankProject();
  } else if (pendingAction === "edit") {
    setEditing(true);
  }
}

/* ---------- create / save / delete ---------- */
function createBlankProject() {
  project = {
    id: "",
    owner,
    name: "New Mission",
    intro: "",
    report: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  renderProject();
  setEditing(true);
}

async function saveProject() {
  if (!project) return;

  /* validate the chosen target before saving */
  let link = "";
  if (pendingType === "web") {
    link = normalizeLink(webUrl.value);
    if (!link) {
      webUrlError.hidden = false;
      webUrl.focus();
      return;
    }
    webUrlError.hidden = true;
  } else if (pendingType === "app" && !project.apkSize && !pendingApkDataUrl) {
    window.alert("Choose an APK file for this app project first.");
    apkFile.click();
    return;
  }

  /* never publish a placeholder name: fall back to the APK or site */
  let name = titleEl.textContent.trim();
  const isDefault = !name || DEFAULT_TITLES.includes(name.toLowerCase());
  if (isDefault && pendingType === "app" && pendingApkName) {
    name = pendingApkName.replace(/\.apk$/i, "");
  } else if (isDefault && link) {
    name = hostOf(link);
  }
  name = name || "UNTITLED";

  const payload = Object.assign({}, authFields(), {
    name,
    intro: introInput.value,
    report: reportInput.value,
    type: pendingType,
    linkUrl: pendingType === "web" ? link : "",
  });

  try {
    if (isNew || !project.id) {
      project = await window.ANBU.api.createProject(owner, payload);
      const url = `project.html?owner=${owner}&id=${project.id}`;
      window.history.replaceState({}, "", url);
      params.set("id", project.id);
    } else {
      project = await window.ANBU.api.updateProject(owner, project.id, payload);
    }
  } catch (e) {
    window.alert(e && e.message ? e.message : "Could not save. Check your password.");
    return;
  }

  /* push the APK binary after the record itself is safe */
  if (pendingType === "app" && pendingApkDataUrl) {
    try {
      const res = await window.ANBU.api.uploadApk(owner, project.id, Object.assign({}, authFields(), {
        apk: pendingApkDataUrl,
        fileName: pendingApkName || name,
      }));
      project.apkName = res.apkName;
      project.apkSize = res.apkSize;
    } catch (e) {
      window.alert(
        (e && e.message ? e.message : "Could not upload the APK.") +
          " The project text was saved — open Edit and pick the APK again."
      );
      setEditing(true);
      return;
    }
  }

  pendingApkDataUrl = null;
  pendingApkName = "";
  renderProject();
  setEditing(false);
}

async function deleteProject() {
  if (!project || !project.id) return;
  if (!window.confirm("Delete this mission file permanently?")) return;
  try {
    await window.ANBU.api.deleteProject(owner, project.id, authFields());
  } catch (e) {
    window.alert(e && e.message ? e.message : "Could not delete.");
    return;
  }
  window.location.href = `profile.html?member=${owner}`;
}

/* ---------- image insert ---------- */
function insertImageMarkup(dataUrl) {
  const align = imageAlign.value;
  const caption = imageCaption.value.trim();
  const alt = caption ? `${align}|${caption}` : align;
  const snippet = `\n![${alt}](${dataUrl})\n`;

  const start = reportInput.selectionStart || 0;
  const end = reportInput.selectionEnd || 0;
  const before = reportInput.value.slice(0, start);
  const after = reportInput.value.slice(end);
  reportInput.value = before + snippet + after;
  reportInput.focus();
  const pos = start + snippet.length;
  reportInput.setSelectionRange(pos, pos);
  reportEl.innerHTML = window.Report.renderReport(reportInput.value);
  imageCaption.value = "";
}

btnAddImage.addEventListener("click", () => imageFile.click());

imageFile.addEventListener("change", async () => {
  const file = imageFile.files && imageFile.files[0];
  if (!file) return;
  try {
    const dataUrl = await window.ANBU.compressImage(file, 900, 0.72);
    insertImageMarkup(dataUrl);
  } catch (e) {
    window.alert(e && e.message ? e.message : "Could not process that image.");
  }
  imageFile.value = "";
});

reportInput.addEventListener("input", () => {
  reportEl.innerHTML = window.Report.renderReport(reportInput.value);
});

/* ---------- project type + apk / web target ---------- */
typeBtns.forEach((btn) => {
  btn.addEventListener("click", () => setType(btn.dataset.type));
});

apkFile.addEventListener("change", () => {
  const file = apkFile.files && apkFile.files[0];
  apkFile.value = "";
  if (!file) return;

  const isApk = /\.apk$/i.test(file.name) || file.type === "application/vnd.android.package-archive";
  if (!isApk) {
    window.alert("That is not an .apk file.");
    return;
  }
  if (file.size > MAX_APK_BYTES) {
    window.alert(`APK is too large (${formatBytes(file.size)}). Maximum is 250 MB.`);
    return;
  }

  const reader = new FileReader();
  reader.onerror = () => window.alert("Could not read that file.");
  reader.onload = () => {
    pendingApkDataUrl = reader.result;
    pendingApkName = file.name;
    apkStatus.textContent = `${file.name} (${formatBytes(file.size)}) ready — press Save to upload.`;
    if (titleIsDefault()) {
      titleEl.textContent = file.name.replace(/\.apk$/i, "");
    }
  };
  reader.readAsDataURL(file);
});

webUrl.addEventListener("input", () => {
  webUrlError.hidden = true;
  const host = hostOf(webUrl.value);
  if (host && titleIsDefault()) {
    titleEl.textContent = host;
  }
});

/* ---------- wire up ---------- */
btnEdit.addEventListener("click", () => {
  if (adminActive() || ownerActive()) setEditing(true);
  else showAccess("edit");
});

btnSave.addEventListener("click", saveProject);

btnCancel.addEventListener("click", () => {
  renderProject();
  setEditing(false);
});

btnDelete.addEventListener("click", deleteProject);

btnUnlock.addEventListener("click", tryUnlock);
accessInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") tryUnlock();
});

btnUnlockCancel.addEventListener("click", () => {
  accessPanel.hidden = true;
  accessInput.value = "";
  accessError.hidden = true;
  pendingAction = "view";
});

/* ---------- init ---------- */
(async function init() {
  const ownerMember = await window.ANBU.api.getMember(owner);
  if (ownerMember) {
    ownerLine.textContent = `Filed under ${ownerMember.name}.`;
    backLink.href = `profile.html?member=${owner}`;
  }

  if (isNew) {
    if (adminActive() || ownerActive()) {
      createBlankProject();
    } else {
      showAccess("create");
    }
    return;
  }

  if (!projectId) {
    ownerLine.textContent = "No mission file selected.";
    return;
  }

  const list = await window.ANBU.api.listProjects(owner);
  project = list.find((p) => p.id === projectId) || null;
  if (!project) {
    titleEl.textContent = "FILE NOT FOUND";
    introEl.textContent = "This mission file does not exist.";
    return;
  }
  renderProject();

  /* deep link from the dashboard (?edit=1): jump straight into
     edit mode when a valid session is already active */
  if (params.get("edit") === "1") {
    if (adminActive() || ownerActive()) setEditing(true);
    else showAccess("edit");
  }
})();
