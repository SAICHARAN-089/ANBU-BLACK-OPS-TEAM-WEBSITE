/* ============================================================
   ANBU BLACK OPS — Password hashing (Node crypto, no deps)
   ============================================================ */
const crypto = require("crypto");

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, record) {
  if (!record || !record.salt || !record.hash) return false;
  const test = crypto.scryptSync(String(password), record.salt, 64).toString("hex");
  const a = Buffer.from(test, "hex");
  const b = Buffer.from(record.hash, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = { hashPassword, verifyPassword };
