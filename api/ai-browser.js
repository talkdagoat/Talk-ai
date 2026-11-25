const crypto = require("node:crypto");
const net = require("node:net");
function verify(token) {
  const p = String(token || "").split(".");
  if (p.length !== 2 || !process.env.PROXY_SESSION_SECRET) return null;
  const expected = crypto.createHmac("sha256", process.env.PROXY_SESSION_SECRET).update(p[0]).digest();
  let got; try { got = Buffer.from(p[1], "base64url"); } catch { return null; }
  if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) return null;
  try { const d = JSON.parse(Buffer.from(p[0], "base64url").toString("utf8")); return d.kind === "ai" && d.exp > Date.now() ? d : null; } catch { return null; }
}
function safeUrl(value) {
  const u = new URL(value);
  if (!["http:", "https:"].includes(u.protocol) || u.username || u.password) throw new Error("Only public HTTP and HTTPS websites are allowed.");
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) throw new Error("Private network hosts are blocked.");
  const ip = net.isIP(h);
  if (ip === 4) { const n = h.split(".").map(Number); if (n[0] === 0 || n[0] === 10 || n[0] === 127 || n[0] >= 224 || (n[0] === 169 && n[1] === 254) || (n[0] === 172 && n[1] >= 16 && n[1] <= 31) || (n[0] === 192 && n[1] === 168)) throw new Error("Private network IPs are blocked."); }
  if (ip === 6 && (h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80"))) throw new Error("Private network IPs are blocked.");
  return u;
}
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Use POST with JSON." }); }
  const body = req.body || {};
  if (!verify(body.token)) return res.status(401).json({ error: "Missing, invalid, or expired AI token. Verify in GhostBrowse again." });
  if (!process.env.BROWSERLESS_TOKEN) return res.status(503).json({ error: "Interactive browser mode is not configured. Add BROWSERLESS_TOKEN to Vercel environment variables." });
  let start; try { start = safeUrl(String(body.url || "")); } catch (e) { return res.status(400).json({ error: e.message }); }
  const actions = Array.isArray(body.actions) ? body.actions : [];
  if (actions.length > 12) return res.status(400).json({ error: "Maximum 12 browser actions per request." });
  const allowed = new Set(["click", "type", "press", "wait", "scroll", "snapshot", "screenshot"]);
  for (const a of actions) {
    if (!a || !allowed.has(a.type)) return res.status(400).json({ error: "Unsupported action. Use click, type, press, wait, scroll, snapshot, or screenshot." });
    if (a.selector && String(a.selector).length > 500) return res.status(400).json({ error: "Selector is too long." });
    if (a.text && String(a.text).length > 2000) return res.status(400).json({ error: "Typed text is too long." });
  }
  const code = "export default async ({ page, context }) => {\n  const start = new URL(context.url);\n  await page.setRequestInterception(true);\n  page.on(\"request\", request => {\n    try {\n      const target = new URL(request.url());\n      const host = target.hostname.toLowerCase();\n      const local = host === \"localhost\" || host.endsWith(\".localhost\") || host.endsWith(\".local\") || host === \"127.0.0.1\" || host === \"::1\" || /^10\\./.test(host) || /^192\\.168\\./.test(host) || /^169\\.254\\./.test(host) || /^172\\.(1[6-9]|2[0-9]|3[01])\\./.test(host);\n      if ((target.protocol === \"http:\" || target.protocol === \"https:\") && host === start.hostname && !local) request.continue(); else request.abort();\n    } catch (_) { request.abort(); }\n  });\n  await page.goto(context.url, { waitUntil: \"domcontentloaded\", timeout: 25000 });\n  const results = [];\n  for (const action of context.actions) {\n    try {\n      if (action.type === \"click\") await page.click(action.selector, { timeout: 8000 });\n      else if (action.type === \"type\") await page.type(action.selector, String(action.text || \"\"), { delay: 20 });\n      else if (action.type === \"press\") await page.keyboard.press(String(action.key || \"Enter\"));\n      else if (action.type === \"wait\") await page.waitForTimeout(Math.min(5000, Math.max(100, Number(action.ms) || 800)));\n      else if (action.type === \"scroll\") await page.evaluate(() => window.scrollBy(0, Math.max(100, Math.min(1500, Number(window.innerHeight) || 700))));\n      else if (action.type === \"snapshot\") results.push({ type: \"snapshot\", title: await page.title(), url: page.url(), text: (await page.evaluate(() => document.body ? document.body.innerText : \"\")).slice(0, 18000), links: await page.$$eval(\"a[href]\", nodes => nodes.slice(0, 60).map(a => ({ text: (a.innerText || a.getAttribute(\"aria-label\") || \"\").trim().slice(0, 160), url: a.href })).filter(a => a.text) });\n      else if (action.type === \"screenshot\") results.push({ type: \"screenshot\", base64: await page.screenshot({ encoding: \"base64\", fullPage: false }) });\n      results.push({ type: action.type, ok: true });\n    } catch (error) { results.push({ type: action.type, ok: false, error: String(error.message || error).slice(0, 300) }); }\n  }\n  if (!context.actions.some(a => a.type === \"snapshot\")) results.push({ type: \"snapshot\", title: await page.title(), url: page.url(), text: (await page.evaluate(() => document.body ? document.body.innerText : \"\")).slice(0, 18000) });\n  return { ok: true, note: \"Temporary single-request browser run. Cookies and page state are not retained between API calls.\", results };\n}";
  const endpoint = new URL("https://production-sfo.browserless.io/function");
  endpoint.searchParams.set("token", process.env.BROWSERLESS_TOKEN);
  endpoint.searchParams.append("allowedDomains", start.hostname);
  let upstream;
  try {
    upstream = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify({ code, context: { url: start.href, actions } }), signal: AbortSignal.timeout(45000) });
  } catch { return res.status(502).json({ error: "Remote browser could not be reached. Check Browserless configuration." }); }
  const raw = await upstream.text();
  if (!upstream.ok) return res.status(502).json({ error: "Remote browser returned an error.", providerStatus: upstream.status, detail: raw.slice(0, 1200) });
  try { return res.status(200).json(JSON.parse(raw)); } catch { return res.status(200).json({ ok: true, contentType: upstream.headers.get("content-type") || "text/plain", result: raw.slice(0, 18000) }); }
};
