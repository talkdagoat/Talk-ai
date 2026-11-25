const crypto = require("node:crypto");
const COOKIE = "gb_session";
const CHALLENGE_COOKIE = "gb_challenge";
const IDLE_MS = 30 * 60 * 1000;
function sign(value) {
  return crypto.createHmac("sha256", process.env.PROXY_SESSION_SECRET).update(value).digest("base64url");
}
function readCookie(req, name) {
  const part = (req.headers.cookie || "").split(";").map(v => v.trim()).find(v => v.startsWith(name + "="));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : "";
}
function verifySigned(token) {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const expected = crypto.createHmac("sha256", process.env.PROXY_SESSION_SECRET).update(parts[0]).digest();
  let supplied;
  try { supplied = Buffer.from(parts[1], "base64url"); } catch { return null; }
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return null;
  try { return JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")); } catch { return null; }
}
function issue(data) {
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  return payload + "." + sign(payload);
}
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({error:"Use POST."}); }
  if (!process.env.PROXY_SESSION_SECRET || process.env.PROXY_SESSION_SECRET.length < 32)
    return res.status(503).json({error:"Server session secret is not configured."});
  const challenge = verifySigned(readCookie(req, CHALLENGE_COOKIE));
  const answer = String((req.body && req.body.answer) || "").trim();
  if (!challenge || challenge.exp < Date.now() || challenge.used || answer !== String(challenge.answer)) {
    res.setHeader("Set-Cookie", CHALLENGE_COOKIE + "=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax");
    return res.status(403).json({error:"Verification expired or answer was incorrect. Get a new verification challenge."});
  }
  const now = Date.now();
  const sessionToken = issue({iat:now, exp:now+IDLE_MS, nonce:crypto.randomBytes(18).toString("hex"), kind:"browser"});
  const aiToken = issue({iat:now, exp:now+IDLE_MS, nonce:crypto.randomBytes(24).toString("hex"), kind:"ai"});
  res.setHeader("Set-Cookie", [
    COOKIE + "=" + sessionToken + "; Path=/; Max-Age=1800; HttpOnly; Secure; SameSite=Lax",
    CHALLENGE_COOKIE + "=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax"
  ]);
  return res.status(200).json({ok:true, expiresIn:1800, proxyToken:sessionToken, aiToken, aiTokenExpiresIn:1800});
};
