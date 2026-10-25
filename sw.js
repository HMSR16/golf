// 電波がなくても開けるように、アプリのファイルをスマホに保存しておく。
// 新しい版があれば、電波のある時に取り込み、次に開いた時から新しい版になる。
const CACHE='vegas-v39';
const FILES=['./','./index.html','./manifest.webmanifest','./icons/apple-touch-icon.png','./icons/icon-192.png','./icons/icon-512.png','./icons/favicon-32.png','./backend-firebase.js'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const req=e.request; if(req.method!=='GET') return;
  const url=new URL(req.url);
  if(url.origin!==location.origin){ // 文字の形（フォント）など外のファイル：保存してあればそれを使う
    e.respondWith(caches.match(req).then(r=>r||fetch(req).then(res=>{const c=res.clone(); caches.open(CACHE).then(ca=>ca.put(req,c)); return res;}).catch(()=>r)));
    return;}
  // アプリ本体：まず新しい版を取りに行き、電波がなければ保存してある版を使う
  // 電波が弱くて3秒以内に届かない時も、保存してある版ですぐ開く
  const net=fetch(req).then(res=>{const c=res.clone(); caches.open(CACHE).then(ca=>ca.put(req,c)); return res;});
  const fallback=()=>caches.match(req).then(r=>r||caches.match('./index.html'));
  e.respondWith(new Promise(resolve=>{let done=false;
    const t=setTimeout(()=>fallback().then(r=>{if(r&&!done){done=true;resolve(r);}}),3000);
    net.then(r=>{if(!done){done=true;clearTimeout(t);resolve(r);}}).catch(()=>fallback().then(r=>{if(!done){done=true;clearTimeout(t);resolve(r||Response.error());}}));}));
});
