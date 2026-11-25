const crypto = require("node:crypto");
const net = require("node:net");
const dns = require("node:dns/promises");
function verify(token) {
  const p = String(token || "").split(".");
  if (p.length !== 2 || !process.env.PROXY_SESSION_SECRET) return false;
  const expected = crypto.createHmac("sha256", process.env.PROXY_SESSION_SECRET).update(p[0]).digest();
  let got; try { got = Buffer.from(p[1], "base64url"); } catch { return false; }
  if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) return false;
  try { const d = JSON.parse(Buffer.from(p[0], "base64url").toString("utf8")); return d.kind === "ai" && d.exp > Date.now(); } catch { return false; }
}
function privateIp(ip) {
  const v = net.isIP(ip);
  if (v === 4) { const n = ip.split(".").map(Number); return n[0] === 0 || n[0] === 10 || n[0] === 127 || n[0] >= 224 || (n[0] === 169 && n[1] === 254) || (n[0] === 172 && n[1] >= 16 && n[1] <= 31) || (n[0] === 192 && n[1] === 168); }
  if (v === 6) return ip === "::1" || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80") || ip.startsWith("::ffff:127.");
  return false;
}
async function safeUrl(value) {
  const u = new URL(value);
  if (!["http:", "https:"].includes(u.protocol) || u.username || u.password) throw new Error("Only public HTTP and HTTPS URLs are allowed.");
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host === "metadata.google.internal") throw new Error("Private network hosts are blocked.");
  if (net.isIP(host)) { if (privateIp(host)) throw new Error("Private network IPs are blocked."); }
  else { const addresses = await dns.lookup(host, { all: true, verbatim: true }); if (!addresses.length || addresses.some(a => privateIp(a.address))) throw new Error("The website resolves to a private or restricted network address."); }
  return u;
}
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Use POST with JSON." }); }
  const body = req.body || {};
  if (!verify(body.token)) return res.status(401).json({ error: "Missing, invalid, or expired AI token. Complete the one-time check in GhostBrowse first." });
  if (!process.env.BROWSERLESS_TOKEN) return res.status(503).json({ error: "Interactive browser mode is not configured. Add BROWSERLESS_TOKEN to the GhostBrowse Vercel project, for Production, Preview and Development." });
  let start; try { start = await safeUrl(String(body.url || "")); } catch (e) { return res.status(400).json({ error: e.message }); }
  const actions = Array.isArray(body.actions) ? body.actions : [];
  if (actions.length > 12) return res.status(400).json({ error: "Maximum 12 browser actions per request." });
  const allowed = new Set(["click", "type", "press", "wait", "scroll", "snapshot", "screenshot"]);
  for (const a of actions) { if (!a || !allowed.has(a.type)) return res.status(400).json({ error: "Unsupported action. Use click, type, press, wait, scroll, snapshot, or screenshot." }); if (a.selector && String(a.selector).length > 500) return res.status(400).json({ error: "Selector is too long." }); if (a.text && String(a.text).length > 2000) return res.status(400).json({ error: "Typed text is too long." }); }
  const code = "export default async ({ page, context }) => {\n  await page.setRequestInterception(true);\n  page.on(\"request\", request => {\n    try {\n      const target = new URL(request.url());\n      if (target.protocol === \"data:\" || target.protocol === \"blob:\" || target.protocol === \"about:\") return request.continue();\n      if (![\"http:\", \"https:\"].includes(target.protocol)) return request.abort();\n      const host = target.hostname.toLowerCase().replace(/^\\[|\\]$/g, \"\");\n      const localName = host === \"localhost\" || host.endsWith(\".localhost\") || host.endsWith(\".local\") || host.endsWith(\".internal\") || host === \"metadata.google.internal\";\n      const privateV4 = /^(0\\.|10\\.|127\\.|169\\.254\\.|192\\.168\\.|172\\.(1[6-9]|2[0-9]|3[01])\\.)/.test(host);\n      const multicastV4 = /^(22[4-9]|23[0-9]|24[0-9]|25[0-5])\\./.test(host);\n      const privateV6 = host === \"::1\" || host.startsWith(\"fc\") || host.startsWith(\"fd\") || host.startsWith(\"fe80\") || host.startsWith(\"::ffff:127.\");\n      if (localName || privateV4 || multicastV4 || privateV6) return request.abort();\n      request.continue();\n    } catch (_) { request.abort(); }\n  });\n  await page.goto(context.url, { waitUntil: \"domcontentloaded\", timeout: 25000 });\n  const results = [];\n  for (const action of context.actions) {\n    try {\n      if (action.type === \"click\") await page.click(action.selector, { timeout: 8000 });\n      else if (action.type === \"type\") await page.type(action.selector, String(action.text || \"\"), { delay: 20 });\n      else if (action.type === \"press\") await page.keyboard.press(String(action.key || \"Enter\"));\n      else if (action.type === \"wait\") await page.waitForTimeout(Math.min(5000, Math.max(100, Number(action.ms) || 800)));\n      else if (action.type === \"scroll\") await page.evaluate(() => window.scrollBy(0, Math.max(100, Math.min(1500, Number(window.innerHeight) || 700))));\n      else if (action.type === \"snapshot\") results.push({ type: \"snapshot\", title: await page.title(), url: page.url(), text: (await page.evaluate(() => document.body ? document.body.innerText : \"\")).slice(0, 18000), links: await page.$$eval(\"a[href]\", nodes => nodes.slice(0, 60).map(a => ({ text: (a.innerText || a.getAttribute(\"aria-label\") || \"\").trim().slice(0, 160), url: a.href })).filter(a => a.text) });\n      else if (action.type === \"screenshot\") results.push({ type: \"screenshot\", base64: await page.screenshot({ encoding: \"base64\", fullPage: false }) });\n      results.push({ type: action.type, ok: true });\n    } catch (error) { results.push({ type: action.type, ok: false, error: String(error.message || error).slice(0, 300) }); }\n  }\n  if (!context.actions.some(a => a.type === \"snapshot\")) results.push({ type: \"snapshot\", title: await page.title(), url: page.url(), text: (await page.evaluate(() => document.body ? document.body.innerText : \"\")).slice(0, 18000) });\n  return { ok: true, note: \"Temporary single-request browser run. Cookies and page state are not retained between API calls.\", results };\n}";
  const endpoint = new URL("https://production-sfo.browserless.io/function");
  endpoint.searchParams.set("token", process.env.BROWSERLESS_TOKEN);
  let upstream;
  try { upstream = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify({ code, context: { url: start.href, actions } }), signal: AbortSignal.timeout(45000) }); }
  catch { return res.status(502).json({ error: "Remote browser could not be reached. Check Browserless configuration." }); }
  const raw = await upstream.text();
  if (!upstream.ok) return res.status(502).json({ error: "Remote browser returned an error.", providerStatus: upstream.status, detail: raw.slice(0, 1200) });
  try { return res.status(200).json(JSON.parse(raw)); } catch { return res.status(200).json({ ok: true, contentType: upstream.headers.get("content-type") || "text/plain", result: raw.slice(0, 18000) }); }
};
