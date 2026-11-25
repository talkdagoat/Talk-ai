(()=>{'use strict';
const root=document.getElementById('ghostbrowse-root');
root.innerHTML=`<div class="shell"><header class="top"><div class="brand"><span class="mark">👻</span><span>Ghost<em>Browse</em></span></div><div class="pill">● VERCEL SESSION</div><button class="clear" id="clear" title="Clear session">⌫</button></header><main class="main"><section class="hero" id="home"><div class="eyebrow">✦ YOUR QUIETER CORNER OF THE WEB</div><h1>Browse without<br><span>the big reveal.</span></h1><p class="sub">Open websites inside this page. When a site allows embedding, its address stays in the embedded viewer instead of replacing GhostBrowse in your browser's address bar.</p><form class="address" id="open"><span class="glass">⌕</span><input id="address" autocomplete="off" spellcheck="false" placeholder="Enter a website or search the web…" aria-label="Website or search"><button class="go">Open ↗</button></form><div class="chips"><button class="chip" data-url="https://www.wikipedia.org">Wikipedia</button><button class="chip" data-url="https://www.mozilla.org">Mozilla</button><button class="chip" data-url="https://example.com">Example</button></div><div class="features"><div class="feature"><span class="ico">◈</span><b>Embedded view</b><small>Stay on this page</small></div><div class="feature"><span class="ico">⌁</span><b>No account</b><small>No sign-up needed</small></div><div class="feature"><span class="ico">⟲</span><b>Clear session</b><small>Reset this page</small></div></div></section><section class="browser hidden" id="browser"><div class="bar"><button class="tool" id="back" title="Back">←</button><button class="tool" id="forward" title="Forward">→</button><button class="tool" id="reload" title="Reload">↻</button><form class="urlbar" id="mini"><span>◈</span><input id="current" aria-label="Website address"><button>Go</button></form><button class="tool" id="close" title="Close">×</button></div><div class="framewrap"><iframe id="frame" title="Embedded website" referrerpolicy="no-referrer" sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals" allow="fullscreen; clipboard-read; clipboard-write"></iframe><div class="notice hidden" id="blocked"><div style="font-size:36px">🛡️</div><h2>This site may block embedded viewing</h2><p>Some websites refuse to load inside another website for security reasons. GhostBrowse cannot bypass those restrictions. If the frame stays blank, use the link below.</p><button id="retry">Try again</button><a id="external" target="_blank" rel="noopener noreferrer">Open this website in a new tab ↗</a></div></div><div class="foot"><i class="dot"></i> Embedded browsing view <span>Websites and networks may still see your activity.</span></div></section></main><footer><span>GHOSTBROWSE</span><span>Private by design · Not an anonymity tool</span></footer></div>`;
const $=id=>document.getElementById(id);let active='',timer,accessCode='';
function toast(s){const el=document.createElement('div');el.textContent=s;el.style.cssText='position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:#252b3d;border:1px solid #414a65;border-radius:10px;padding:11px 15px;color:white;font-size:12px;z-index:9';document.body.append(el);setTimeout(()=>el.remove(),2600)}
function normalize(raw){let v=raw.trim();if(!v)return '';if(!/^[a-z][a-z0-9+.-]*:/i.test(v)){v=v.includes('.')&&!v.includes(' ')?'https://'+v:'https://www.google.com/search?q='+encodeURIComponent(v)}try{const u=new URL(v);return ['http:','https:'].includes(u.protocol)?u.href:''}catch{return ''}}
async function open(raw){
 const url=normalize(raw);
 if(!url){toast('Enter a valid website or search term.');return}
 active=url;clearTimeout(timer);$('current').value=url;$('external').href=url;
 $('home').classList.add('hidden');$('browser').classList.remove('hidden');
 $('blocked').classList.add('hidden');$('frame').classList.remove('hidden');
 try{
  if(!accessCode){accessCode=window.prompt('Enter your GhostBrowse access code')||'';if(!accessCode)return}
  const start=await fetch('/api/session',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({accessCode})});
  const data=await start.json().catch(()=>({}));
  if(!start.ok){if(start.status===403)accessCode='';throw new Error(data.error||'Could not start a Vercel session.')}
  $('frame').src='/api/proxy?url='+encodeURIComponent(url);
  timer=setTimeout(()=>$('blocked').classList.remove('hidden'),12000);
  history.replaceState({ghostbrowse:true},'',location.pathname+location.search+'#view');
 }catch(e){toast(e.message||'Vercel proxy could not start.');$('blocked').classList.remove('hidden')}
}
function home(){ $('frame').src='about:blank';active='';$('browser').classList.add('hidden');$('home').classList.remove('hidden');$('address').value='';history.replaceState({ghostbrowse:true},'',location.pathname+location.search)}
$('open').addEventListener('submit',e=>{e.preventDefault();open($('address').value)});
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