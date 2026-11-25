const crypto = require("node:crypto");
const net = require("node:net");
function verify(token) {
  const p=String(token||"").split(".");
  if(p.length!==2||!process.env.PROXY_SESSION_SECRET)return null;
  const expected=crypto.createHmac("sha256",process.env.PROXY_SESSION_SECRET).update(p[0]).digest();
  let got; try{got=Buffer.from(p[1],"base64url")}catch{return null}
  if(got.length!==expected.length||!crypto.timingSafeEqual(got,expected))return null;
  try{const d=JSON.parse(Buffer.from(p[0],"base64url").toString("utf8"));return d.kind==="ai"&&d.exp>Date.now()?d:null}catch{return null}
}
function safeUrl(value){
 const u=new URL(value);
 if(!["http:","https:"].includes(u.protocol)||u.username||u.password)throw new Error("Only public HTTP and HTTPS URLs are allowed.");
 const h=u.hostname.toLowerCase().replace(/^\[|\]$/g,"");
 if(h==="localhost"||h.endsWith(".localhost")||h.endsWith(".local")||h.endsWith(".internal"))throw new Error("Private network hosts are blocked.");
 const ip=net.isIP(h);
 if(ip===4){
  const n=h.split(".").map(Number);
  if(n[0]===0||n[0]===10||n[0]===127||n[0]>=224||(n[0]===169&&n[1]===254)||(n[0]===172&&n[1]>=16&&n[1]<=31)||(n[0]===192&&n[1]===168))throw new Error("Private network IPs are blocked.");
 }
 if(ip===6 && (h==="::1"||h.startsWith("fc")||h.startsWith("fd")||h.startsWith("fe80")))throw new Error("Private network IPs are blocked.");
 return u;
}
module.exports=async function handler(req,res){
 res.setHeader("Cache-Control","no-store");
 if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({error:"Use POST with JSON."})}
 const body=req.body||{};
 if(!verify(body.token))return res.status(401).json({error:"Missing, invalid, or expired AI access token. Complete the human check in GhostBrowse first."});
 let url;try{url=safeUrl(String(body.url||""))}catch(e){return res.status(400).json({error:e.message})}
 let response;
 try{response=await fetch(url,{method:"GET",headers:{Accept:"text/html, text/plain, application/json, application/xml;q=0.9, */*;q=0.5","User-Agent":"GhostBrowse-Reader/1.0"},redirect:"follow",signal:AbortSignal.timeout(18000)})}
 catch{return res.status(502).json({error:"The destination could not be fetched. It may be unavailable or block server requests."})}
 const type=response.headers.get("content-type")||"";
 if(!/(text\/|application\/(json|xml|javascript|xhtml\+xml))/.test(type))return res.status(415).json({error:"This endpoint returns readable web content only; binary downloads are not supported.",contentType:type});
 const reader=response.body.getReader();let chunks=[],size=0,tooLarge=false;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1024*1024){tooLarge=true;await reader.cancel();break}chunks.push(Buffer.from(value))}}catch{return res.status(502).json({error:"Could not read the destination response."})}
 if(tooLarge)return res.status(413).json({error:"Page exceeds the 1 MB response limit."});
 const text=Buffer.concat(chunks).toString("utf8");
 return res.status(200).json({ok:true,url:url.href,finalUrl:response.url,status:response.status,contentType:type,content:text});
};
