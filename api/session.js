const crypto = require("node:crypto");

const COOKIE = "gb_session";
const IDLE_MS = 15 * 60 * 1000;

function sign(value) {
  return crypto.createHmac("sha256", process.env.PROXY_SESSION_SECRET).update(value).digest("base64url");
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST to start a browsing session." });
  }
  if (!process.env.PROXY_SESSION_SECRET || process.env.PROXY_SESSION_SECRET.length < 32) {
    return res.status(503).json({ error: "The Vercel session secret is not configured." });
  }
  const supplied = String((req.body && req.body.accessCode) || "");
  const expected = String(process.env.GHOSTBROWSE_ACCESS_CODE || "");
  const a = Buffer.from(supplied); const b = Buffer.from(expected);
  if (!expected || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(403).json({ error: "Incorrect GhostBrowse access code." });
  }
  const now = Date.now();
  const payload = Buffer.from(JSON.stringify({ iat: now, exp: now + IDLE_MS, nonce: crypto.randomBytes(18).toString("hex") })).toString("base64url");
  const token = payload + "." + sign(payload);
  res.setHeader("Set-Cookie", `${COOKIE}=${token}; Path=/; Max-Age=900; HttpOnly; Secure; SameSite=Lax`);
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ ok: true, expiresIn: 900 });
};
