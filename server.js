/* ============================================================
   ANBU BLACK OPS — Local dev server
   ------------------------------------------------------------
   Serves the static site AND the /api backend from one port so
   every visitor shares the same data (no CORS, one entry point).
   ============================================================ */

const path = require("path");
const { createApp } = require("./lib/app");

const app = createApp();

const ROOT = __dirname;
app.use(expressStatic(ROOT));

// SPA-style fallback for unknown routes (not strictly needed here).
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(ROOT, "index.html"));
});

const PORT = process.env.PORT || 3001;
app.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    console.error(
      `\n[anbu] Port ${PORT} is already in use — the server is probably already running.\n` +
        `[anbu] Open http://localhost:${PORT} in your browser, or stop the other\n` +
        `[anbu] server first (close its terminal window or: npx kill-port ${PORT}).\n`
    );
    process.exit(1);
  }
  throw err;
});
app.listen(PORT, () => {
  console.log(`ANBU BLACK OPS server running on http://localhost:${PORT}`);
});

/* Express 4 static helper (avoids an extra require at top). */
function expressStatic(root) {
  const express = require("express");
  return express.static(root);
}
