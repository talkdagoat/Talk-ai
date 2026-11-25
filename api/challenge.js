const crypto = require("node:crypto");
function sign(value) {
  return crypto.createHmac("sha256", process.env.PROXY_SESSION_SECRET).update(value).digest("base64url");
}
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") { res.setHeader("Allow","GET"); return res.status(405).json({error:"Use GET."}); }
  if (!process.env.PROXY_SESSION_SECRET || process.env.PROXY_SESSION_SECRET.length < 32)
    return res.status(503).json({error:"Server session secret is not configured."});
  const a = crypto.randomInt(2, 10), b = crypto.randomInt(2, 10);
  const data = {answer:a+b, exp:Date.now()+5*60*1000, nonce:crypto.randomBytes(12).toString("hex")};
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  const token = payload + "." + sign(payload);
  res.setHeader("Set-Cookie","gb_challenge="+token+"; Path=/; Max-Age=300; HttpOnly; Secure; SameSite=Lax");
  return res.status(200).json({question:"What is "+a+" + "+b+"?", expiresIn:300});
};
