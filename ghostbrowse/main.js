(()=>{'use strict';
const root=document.getElementById('ghostbrowse-root');
root.innerHTML=`<div class="shell"><header class="top"><div class="brand"><span class="mark">👻</span><span>Ghost<em>Browse</em></span></div><div class="pill">● VERCEL SESSION</div><button class="clear" id="clear" title="Clear session">⌫</button></header><main class="main"><section class="hero" id="home"><div class="eyebrow">✦ YOUR QUIETER CORNER OF THE WEB</div><h1>Browse without<br><span>the big reveal.</span></h1><p class="sub">Open websites inside this page. When a site allows embedding, its address stays in the embedded viewer instead of replacing GhostBrowse in your browser's address bar.</p><form class="address" id="open"><span class="glass">⌕</span><input id="address" autocomplete="off" spellcheck="false" placeholder="Enter a website or search the web…" aria-label="Website or search"><button class="go">Open ↗</button></form><div class="chips"><button class="chip" data-url="https://www.wikipedia.org">Wikipedia</button><button class="chip" data-url="https://www.mozilla.org">Mozilla</button><button class="chip" data-url="https://example.com">Example</button><button class="chip" id="verify-human">Verify for AI access</button></div><div class="features"><div class="feature"><span class="ico">◈</span><b>Embedded view</b><small>Stay on this page</small></div><div class="feature"><span class="ico">⌁</span><b>No account</b><small>No sign-up needed</small></div><div class="feature"><span class="ico">⟲</span><b>Clear session</b><small>Reset this page</small></div></div></section><section id="ai-panel" class="hidden" style="width:min(760px,100%);margin:0 auto 24px;padding:18px;background:#141a2a;border:1px solid #2b3349;border-radius:14px"><b style="font-size:14px">AI web access is ready</b><p style="font-size:12px;color:#929bb1;line-height:1.6">Give your AI the endpoint and this JSON request body. The token expires after 30 minutes.</p><div id="ai-endpoint" style="font-size:11px;color:#78ded0;margin:8px 0">POST /api/ai-web · Content-Type: application/json</div><textarea id="ai-json" readonly rows="4" style="width:100%;padding:10px;background:#090b14;color:#e9eafa;border:1px solid #343c54;border-radius:8px;font:12px monospace;resize:vertical"></textarea><button id="copy-ai" class="go" style="margin-top:10px">Copy JSON body</button></section><section class="browser hidden" id="browser"><div class="bar"><button class="tool" id="back" title="Back">←</button><button class="tool" id="forward" title="Forward">→</button><button class="tool" id="reload" title="Reload">↻</button><form class="urlbar" id="mini"><span>◈</span><input id="current" aria-label="Website address"><button>Go</button></form><button class="tool" id="close" title="Close">×</button></div><div class="framewrap"><iframe id="frame" title="Embedded website" referrerpolicy="no-referrer" sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals" allow="fullscreen; clipboard-read; clipboard-write"></iframe><div class="notice hidden" id="blocked"><div style="font-size:36px">🛡️</div><h2>This site may block embedded viewing</h2><p>Some websites refuse to load inside another website for security reasons. GhostBrowse cannot bypass those restrictions. If the frame stays blank, use the link below.</p><button id="retry">Try again</button><a id="external" target="_blank" rel="noopener noreferrer">Open this website in a new tab ↗</a></div></div><div class="foot"><i class="dot"></i> Embedded browsing view <span>Websites and networks may still see your activity.</span></div></section></main><footer><span>GHOSTBROWSE</span><span>Private by design · Not an anonymity tool</span></footer></div>`;
const $=id=>document.getElementById(id);let active='',timer,aiToken='';
function toast(s){const el=document.createElement('div');el.textContent=s;el.style.cssText='position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:#252b3d;border:1px solid #414a65;border-radius:10px;padding:11px 15px;color:white;font-size:12px;z-index:9';document.body.append(el);setTimeout(()=>el.remove(),2600)}
function normalize(raw){let v=raw.trim();if(!v)return '';if(!/^[a-z][a-z0-9+.-]*:/i.test(v)){v=v.includes('.')&&!v.includes(' ')?'https://'+v:'https://www.google.com/search?q='+encodeURIComponent(v)}try{const u=new URL(v);return ['http:','https:'].includes(u.protocol)?u.href:''}catch{return ''}}
async function verifyHuman(){
 if(aiToken)return true;
 const challengeResponse=await fetch('/api/challenge',{credentials:'same-origin',cache:'no-store'});
 const challenge=await challengeResponse.json().catch(()=>({}));
 if(!challengeResponse.ok)throw new Error(challenge.error||'Could not start verification.');
 const answer=window.prompt('One-time human check: '+challenge.question);
 if(answer===null)return false;
 const verified=await fetch('/api/session',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({answer:answer.trim()})});
 const data=await verified.json().catch(()=>({}));
 if(!verified.ok)throw new Error(data.error||'Human verification failed.');
 aiToken=data.aiToken||'';
 if(aiToken){
  $('ai-json').value=JSON.stringify({token:aiToken,url:'https://example.com'},null,2);
  $('ai-endpoint').textContent='POST '+window.location.origin+'/api/ai-web · Content-Type: application/json';
  $('ai-panel').classList.remove('hidden');
 }
 return true;
}
async function open(raw){
 const url=normalize(raw);
 if(!url){toast('Enter a valid website or search term.');return}
 active=url;clearTimeout(timer);$('current').value=url;$('external').href=url;
 $('home').classList.add('hidden');$('browser').classList.remove('hidden');
 $('blocked').classList.add('hidden');$('frame').classList.remove('hidden');
 try{
  if(!await verifyHuman())return;
  $('frame').src='/api/proxy?url='+encodeURIComponent(url);
  timer=setTimeout(()=>$('blocked').classList.remove('hidden'),12000);
  history.replaceState({ghostbrowse:true},'',location.pathname+location.search+'#view');
 }catch(e){toast(e.message||'Vercel proxy could not start.');$('blocked').classList.remove('hidden')}
}
function home(){ $('frame').src='about:blank';active='';$('browser').classList.add('hidden');$('home').classList.remove('hidden');$('address').value='';history.replaceState({ghostbrowse:true},'',location.pathname+location.search)}
$('open').addEventListener('submit',e=>{e.preventDefault();open($('address').value)});
$('verify-human').addEventListener('click',async()=>{try{await verifyHuman()}catch(e){toast(e.message)}});
$('copy-ai').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('ai-json').value);toast('AI request JSON copied.')}catch{toast('Select and copy the JSON manually.')}});
$('mini').addEventListener('submit',e=>{e.preventDefault();open($('current').value)});
document.querySelectorAll('[data-url]').forEach(b=>b.addEventListener('click',()=>open(b.dataset.url)));
$('reload').onclick=()=>{if(active)$('frame').src='/api/proxy?url='+encodeURIComponent(active)};
$('back').onclick=()=>{try{$('frame').contentWindow.history.back()}catch{toast('This site blocks embedded navigation controls.')}};
$('forward').onclick=()=>{try{$('frame').contentWindow.history.forward()}catch{toast('This site blocks embedded navigation controls.')}};
$('close').onclick=home;$('clear').onclick=()=>{home();toast('Current GhostBrowse view cleared. This cannot erase network or website records.')};
$('retry').onclick=()=>{if(active){$('blocked').classList.add('hidden');$('frame').src='/api/proxy?url='+encodeURIComponent(active)}};
$('frame').addEventListener('load',()=>{if($('frame').src!=='about:blank')clearTimeout(timer)});$('frame').addEventListener('error',()=>{$('blocked').classList.remove('hidden')});
window.addEventListener('message',()=>{/* Do not accept commands from embedded pages. */});
})();