const crypto = require("node:crypto");

const COOKIE = "gb_session";
const MAX_BODY = 2 * 1024 * 1024;

function verifyToken(token) {
  if (!token || !process.env.PROXY_SESSION_SECRET) return false;
  const parts = String(token).split(".");
  if (parts.length !== 2) return false;
  const expected = crypto.createHmac("sha256", process.env.PROXY_SESSION_SECRET).update(parts[0]).digest();
  let supplied;
  try { supplied = Buffer.from(parts[1], "base64url"); } catch { return false; }
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return false;
  try {
    const data = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    return data.kind === "browser" && Number.isFinite(data.exp) && data.exp > Date.now();
  } catch { return false; }
}

function sessionToken(req) {
  const queryToken = typeof req.query.token === "string" ? req.query.token : "";
  if (verifyToken(queryToken)) return queryToken;
  const raw = (req.headers.cookie || "").split(";").map(v => v.trim()).find(v => v.startsWith(COOKIE + "="));
  if (!raw) return "";
  let token = "";
  try { token = decodeURIComponent(raw.slice(COOKIE.length + 1)); } catch { return ""; }
  return verifyToken(token) ? token : "";
}

function checkUrl(value) {
  const u = new URL(value);
  if (!["http:", "https:"].includes(u.protocol) || u.username || u.password) throw new Error("Only normal HTTP and HTTPS website addresses are supported.");
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") ||
      /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h) ||
      /^172\.(1[6-9]|2[0-9]|3[01])\./.test(h) || h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80:")) {
    throw new Error("Private network addresses are blocked for safety.");
  }
  return u;
}

function proxyUrl(target, origin, token) {
  return origin + "/api/proxy?token=" + encodeURIComponent(token) + "&url=" + encodeURIComponent(target);
}

function rewriteHtml(html, baseUrl, proxyOrigin, token) {
  const rewrite = raw => {
    try {
      const u = new URL(raw, baseUrl);
      if (!["http:", "https:"].includes(u.protocol)) return raw;
      return proxyUrl(u.href, proxyOrigin, token);
    } catch { return raw; }
  };
  html = html.replace(/(\b(?:href|src|action|poster|data)\s*=\s*)(["'])(.*?)\2/gi, (all, prefix, quote, value) => {
    if (/^(#|data:|javascript:|mailto:|tel:|blob:)/i.test(value)) return all;
    return prefix + quote + rewrite(value) + quote;
  });
  html = html.replace(/url\((\s*["']?)(https?:\/\/[^)'"]+)\1\)/gi, (all, q, value) => "url(" + q + rewrite(value) + q + ")");
  const prefix = proxyOrigin + "/api/proxy?token=" + encodeURIComponent(token) + "&url=";
  html = html.replace(/<head([^>]*)>/i, all => all + `<base href="${baseUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"><script>
(function(){
 const P=${JSON.stringify(prefix)};
 function prox(v){try{const u=new URL(v,document.baseURI);if(u.protocol==="http:"||u.protocol==="https:")return P+encodeURIComponent(u.href)}catch(e){}return v}
 const f=window.fetch;window.fetch=function(i,o){if(typeof i==="string")i=prox(i);else if(i instanceof Request)i=new Request(prox(i.url),i);return f.call(this,i,o)};
 const x=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){arguments[1]=prox(u);return x.apply(this,arguments)};
 const op=window.open;window.open=function(u){return op.call(window,prox(u),"_self")};
 document.addEventListener("click",function(e){const a=e.target.closest&&e.target.closest("a[href]");if(a&&!/^(#|javascript:|mailto:|tel:)/i.test(a.getAttribute("href")||"")){e.preventDefault();location.href=prox(a.href)}},true);
 document.addEventListener("submit",function(e){const f=e.target;if(f&&f.action){e.preventDefault();location.href=prox(f.action)}},true);
})();
</script>`);
  return html;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Referrer-Policy", "no-referrer");
  const token = sessionToken(req);
  if (!token) return res.status(401).json({ error: "Your browsing session expired. Return to GhostBrowse and verify again." });
  const host = String(req.headers.host || "");
  const proxyOrigin = (req.headers["x-forwarded-proto"] || "https") + "://" + host;
  const raw = typeof req.query.url === "string" ? req.query.url : "";
  if (!raw) return res.status(400).json({ error: "Missing website URL." });
  let target;
  try { target = checkUrl(raw); } catch (e) { return res.status(400).json({ error: e.message || "Invalid website URL." }); }
  const method = ["GET", "HEAD", "POST"].includes(req.method) ? req.method : "GET";
  const headers = new Headers();
  if (req.headers.accept) headers.set("Accept", req.headers.accept);
  if (req.headers["accept-language"]) headers.set("Accept-Language", req.headers["accept-language"]);
  headers.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36");
  let body;
  if (method === "POST") {
    const chunks = []; let size = 0;
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
  } catch {
    return res.status(502).json({ error: "The website could not be reached from Vercel. It may block server requests or be temporarily unavailable." });
  }
  if ([301,302,303,307,308].includes(upstream.status)) {
    const location = upstream.headers.get("location");
    if (location) {
      try {
        const next = checkUrl(new URL(location, target).href);
        res.setHeader("Location", proxyUrl(next.href, proxyOrigin, token));
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
  if (type.includes("text/html")) return res.send(rewriteHtml(await upstream.text(), target.href, proxyOrigin, token));
  return res.send(Buffer.from(await upstream.arrayBuffer()));
};

module.exports.config = { api: { bodyParser: false } };
