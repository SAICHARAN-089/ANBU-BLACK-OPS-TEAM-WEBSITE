/* ============================================================
   ANBU BLACK OPS — Admin Session Toggle (roster page)
   ------------------------------------------------------------
   Signing in as admin (password @820069) grants admin privileges
   for the current browser tab/session. The same flag is read by
   profile.html so the admin unlocks full card editing (including
   changing any operative's password) without re-entering it.
   ============================================================ */

(function () {
  const ADMIN_PASS = "@820069";
  const KEY = window.ANBU.adminSessionKey;
  const ADMIN_PASS_KEY = "anbu-admin-pass";

  const btn = document.getElementById("admin-toggle");
  if (!btn) return;

  function active() {
    return window.ANBU.getSession(KEY) === "1";
  }

  function refresh() {
    btn.textContent = active() ? "Admin: ON" : "Admin";
    btn.classList.toggle("is-active", active());
  }

  btn.addEventListener("click", () => {
    if (active()) {
      window.ANBU.clearSession(KEY);
      refresh();
      return;
    }
    const pw = window.prompt("Enter admin password:");
    if (pw === ADMIN_PASS) {
      window.ANBU.setSession(KEY, "1");
      /* Store the verified password too so admin-only actions
         (e.g. the dashboard "Access Passwords" panel) can re-verify
         against the backend instead of sending an empty password and
         being rejected with "Access denied". */
      window.ANBU.setSession(ADMIN_PASS_KEY, pw);
      refresh();
    } else {
      window.alert("Access denied.");
    }
  });

  refresh();
})();
