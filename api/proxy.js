const crypto = require("node:crypto");

const COOKIE = "gb_session";
const MAX_BODY = 2 * 1024 * 1024;

function validSession(req) {
  const raw = (req.headers.cookie || "").split(";").map(v => v.trim()).find(v => v.startsWith(COOKIE + "="));
  if (!raw || !process.env.PROXY_SESSION_SECRET) return false;
  const token = decodeURIComponent(raw.slice(COOKIE.length + 1));
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const expected = crypto.createHmac("sha256", process.env.PROXY_SESSION_SECRET).update(parts[0]).digest();
  let supplied;
  try { supplied = Buffer.from(parts[1], "base64url"); } catch { return false; }
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return false;
  try {
    const data = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    return Number.isFinite(data.exp) && data.exp > Date.now();
  } catch { return false; }
}

function checkUrl(value) {
  const u = new URL(value);
  if (!["http:", "https:"].includes(u.protocol) || u.username || u.password) throw new Error("Only normal HTTP and HTTPS website addresses are supported.");
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") ||
      /^(127\\.|10\\.|192\\.168\\.|169\\.254\\.|0\\.)/.test(h) ||
      /^172\\.(1[6-9]|2[0-9]|3[01])\\./.test(h) || h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80:")) {
    throw new Error("Private network addresses are blocked for safety.");
  }
  return u;
}

function proxyUrl(target) {
  return "/api/proxy?url=" + encodeURIComponent(target);
}

function rewriteHtml(html, baseUrl) {
  const rewrite = raw => {
    try {
      const u = new URL(raw, baseUrl);
      if (!["http:", "https:"].includes(u.protocol)) return raw;
      return proxyUrl(u.href);
    } catch { return raw; }
  };
  html = html.replace(/(\b(?:href|src|action|poster|data)\s*=\s*)(["'])(.*?)\2/gi, (all, prefix, quote, value) => {
    if (/^(#|data:|javascript:|mailto:|tel:|blob:)/i.test(value)) return all;
    return prefix + quote + rewrite(value) + quote;
  });
  html = html.replace(/url\((\s*["']?)(https?:\/\/[^)'"]+)\1\)/gi, (all, q, value) => "url(" + q + rewrite(value) + q + ")");
  html = html.replace(/<head([^>]*)>/i, (all) => all + `<base href="${baseUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"><script>
(function(){
 const P="/api/proxy?url=";
 function prox(v){try{const u=new URL(v,document.baseURI);if(u.protocol==="http:"||u.protocol==="https:")return P+encodeURIComponent(u.href)}catch(e){}return v}
 const f=window.fetch;window.fetch=function(i,o){if(typeof i==="string")i=prox(i);else if(i instanceof Request)i=new Request(prox(i.url),i);return f.call(this,i,o)};
 const x=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){arguments[1]=prox(u);return x.apply(this,arguments)};
 const op=window.open;window.open=function(u){return op.call(window,prox(u),"_self")};
 document.addEventListener("click",function(e){const a=e.target.closest&&e.target.closest("a[href]");if(a&&!/^(#|javascript:|mailto:|tel:)/i.test(a.getAttribute("href")||"")){e.preventDefault();location.href=prox(a.href)}},true);
 document.addEventListener("submit",function(e){const f=e.target;if(f&&f.action){e.preventDefault();const u=prox(f.action);location.href=u}},true);
})();
</script>`);
  return html;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  if (!validSession(req)) return res.status(401).json({ error: "Your browsing session expired. Return to GhostBrowse and open the site again." });
  const raw = typeof req.query.url === "string" ? req.query.url : "";
  if (!raw) return res.status(400).json({ error: "Missing website URL." });
  let target;
  try { target = checkUrl(raw); } catch (e) { return res.status(400).json({ error: e.message || "Invalid website URL." }); }
  const method = ["GET", "HEAD", "POST"].includes(req.method) ? req.method : "GET";
  const headers = new Headers();
  const accept = req.headers.accept;
  if (accept) headers.set("Accept", accept);
  const lang = req.headers["accept-language"];
  if (lang) headers.set("Accept-Language", lang);
  headers.set("User-Agent", "Mozilla/5.0 (compatible; GhostBrowse/1.0)");
  let body;
  if (method === "POST") {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY) return res.status(413).send("Request body too large.");
      chunks.push(chunk);
    }
    body = Buffer.concat(chunks);
    if (req.headers["content-type"]) headers.set("Content-Type", req.headers["content-type"]);
  }
  let upstream;
  try {
    upstream = await fetch(target, { method, headers, body, redirect: "manual", signal: AbortSignal.timeout(20000) });
  } catch (e) {
    return res.status(502).json({ error: "The website could not be reached from Vercel. It may block server requests or be temporarily unavailable." });
  }
  if ([301,302,303,307,308].includes(upstream.status)) {
    const location = upstream.headers.get("location");
    if (location) {
      try {
        const next = checkUrl(new URL(location, target).href);
        res.setHeader("Location", proxyUrl(next.href));
        return res.status(upstream.status).end();
      } catch {}
    }
  }
  const type = upstream.headers.get("content-type") || "application/octet-stream";
  res.status(upstream.status);
  for (const name of ["content-type", "content-language", "last-modified", "etag"]) {
    const value = upstream.headers.get(name);
    if (value) res.setHeader(name, value);
  }
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (method === "HEAD") return res.end();
  if (type.includes("text/html")) {
    const html = await upstream.text();
    return res.send(rewriteHtml(html, target.href));
  }
  const data = Buffer.from(await upstream.arrayBuffer());
  return res.send(data);
};

module.exports.config = { api: { bodyParser: false } };
