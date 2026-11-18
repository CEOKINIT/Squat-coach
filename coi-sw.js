/* 멀티스레드 실행에 필요한 교차 출처 격리 헤더를 붙이는 서비스 워커 */
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{
 if(e.request.cache==='only-if-cached'&&e.request.mode!=='same-origin')return;
 e.respondWith(fetch(e.request).then(r=>{
  if(r.status===0)return r;
  const h=new Headers(r.headers);h.set('Cross-Origin-Embedder-Policy','require-corp');h.set('Cross-Origin-Opener-Policy','same-origin');h.set('Cross-Origin-Resource-Policy','same-origin');
  return new Response(r.body,{status:r.status,statusText:r.statusText,headers:h});
 }).catch(err=>{console.error(err);return Response.error()}));
});
