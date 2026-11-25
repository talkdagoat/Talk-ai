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
  if (v === 4) {
    const n = ip.split(".").map(Number);
    return n[0] === 0 || n[0] === 10 || n[0] === 127 || n[0] >= 224 ||
      (n[0] === 169 && n[1] === 254) || (n[0] === 172 && n[1] >= 16 && n[1] <= 31) ||
      (n[0] === 192 && n[1] === 168);
  }
  if (v === 6) return ip === "::1" || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80") || ip.startsWith("::ffff:127.");
  return false;
}
async function safeUrl(value) {
  const u = new URL(value);
  if (!["http:", "https:"].includes(u.protocol) || u.username || u.password) throw new Error("Only public HTTP and HTTPS URLs are allowed.");
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("Private network hosts are blocked.");
  if (net.isIP(host)) { if (privateIp(host)) throw new Error("Private network IPs are blocked."); }
  else {
    const addresses = await dns.lookup(host, { all: true, verbatim: true });
    if (!addresses.length || addresses.some(a => privateIp(a.address))) throw new Error("The website resolves to a private or restricted network address.");
  }
  return u;
}
function decodeEntities(s) {
  return s.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}
function htmlText(html) {
  return decodeEntities(html.replace(/<(script|style|noscript|svg)[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)[^>]*>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/[ \t\r\f]+/g, " ").replace(/\n\s+/g, "\n").replace(/\n{3,}/g, "\n\n")).trim().slice(0, 24000);
}
function extractLinks(html, base) {
  const links = [];
  const re = /<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) && links.length < 80) {
    try {
      const u = new URL(decodeEntities(m[2]), base);
      if (!["http:", "https:"].includes(u.protocol)) continue;
      const label = htmlText(m[3]).slice(0, 180);
      if (label) links.push({ text: label, url: u.href });
    } catch {}
  }
  return links;
}
async function fetchPage(initial) {
  let target = initial;
  for (let hop = 0; hop < 6; hop++) {
    await safeUrl(target.href);
    const response = await fetch(target, { method: "GET", headers: { "Accept": "text/html, text/plain, application/json, application/xml;q=0.9", "User-Agent": "Mozilla/5.0 (compatible; GhostBrowseResearch/1.0)" }, redirect: "manual", signal: AbortSignal.timeout(18000) });
    if ([301,302,303,307,308].includes(response.status)) {
      const loc = response.headers.get("location");
      if (!loc) return { response, url: target };
      target = new URL(loc, target);
      continue;
    }
    return { response, url: target };
  }
  throw new Error("Too many redirects.");
}
async function searchWeb(query) {
  const endpoint = new URL("https://html.duckduckgo.com/html/");
  endpoint.searchParams.set("q", query);
  const response = await fetch(endpoint, { headers: { "User-Agent": "Mozilla/5.0 (compatible; GhostBrowseResearch/1.0)", "Accept": "text/html" }, signal: AbortSignal.timeout(18000) });
  if (!response.ok) throw new Error("Search provider returned HTTP " + response.status + ".");
  const html = (await response.text()).slice(0, 1500000);
  const results = [];
  const re = /<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) && results.length < 10) {
    try {
      let url = new URL(decodeEntities(m[1]), "https://duckduckgo.com");
      const redirected = url.searchParams.get("uddg");
      if (redirected) url = new URL(redirected);
      if (!["http:", "https:"].includes(url.protocol)) continue;
      const title = htmlText(m[2]).slice(0, 240);
      const after = html.slice(re.lastIndex, re.lastIndex + 1200);
      const sm = after.match(/class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i);
      results.push({ title, url: url.href, snippet: sm ? htmlText(sm[1]).slice(0, 500) : "" });
    } catch {}
  }
  return results;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Use POST with JSON." }); }
  const body = req.body || {};
  if (!verify(body.token)) return res.status(401).json({ error: "Missing, invalid, or expired AI token. Complete the one-time check in GhostBrowse first." });
  const action = String(body.action || "fetch");
  try {
    if (action === "search") {
      const query = String(body.query || "").trim().slice(0, 400);
      if (!query) return res.status(400).json({ error: "Provide a search query." });
      const results = await searchWeb(query);
      return res.status(200).json({ ok: true, action, query, results });
    }
    if (!["fetch", "links"].includes(action)) return res.status(400).json({ error: "Action must be search, fetch, or links." });
    const url = await safeUrl(String(body.url || ""));
    const { response, url: finalUrl } = await fetchPage(url);
    const type = response.headers.get("content-type") || "";
    if (!response.ok) return res.status(502).json({ error: "Website returned HTTP " + response.status + ".", url: finalUrl.href });
    if (!/(text\/|application\/(json|xml|javascript|xhtml\+xml))/.test(type)) return res.status(415).json({ error: "Only readable text and webpage content is supported.", contentType: type });
    const reader = response.body.getReader();
    const chunks = []; let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 1200000) { await reader.cancel(); return res.status(413).json({ error: "Page exceeds the 1.2 MB limit." }); }
        chunks.push(Buffer.from(value));
      }
    } catch { return res.status(502).json({ error: "Could not read the website response." }); }
    const raw = Buffer.concat(chunks).toString("utf8");
    const isHtml = /html|xhtml/i.test(type);
    const result = { ok: true, action, url: url.href, finalUrl: finalUrl.href, status: response.status, contentType: type };
    if (action === "links") result.links = isHtml ? extractLinks(raw, finalUrl.href) : [];
    else {
      result.title = isHtml ? ((raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "").replace(/<[^>]+>/g, "").trim() : "";
      result.content = isHtml ? htmlText(raw) : raw.slice(0, 24000);
      if (isHtml) result.links = extractLinks(raw, finalUrl.href).slice(0, 40);
    }
    return res.status(200).json(result);
  } catch (error) {
    return res.status(502).json({ error: String(error.message || "Could not complete web request.").slice(0, 500) });
  }
};
