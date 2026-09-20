self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('push',e=>{let d={};try{d=e.data.json();}catch{}e.waitUntil(self.registration.showNotification(d.title||'Fraid',{body:d.body||'Nový odkaz pre tím',icon:'assets/FRAID_LOGO_ICON.png',tag:d.tag||'fraid-note',data:{url:self.registration.scope}}));});
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(self.clients.openWindow(self.registration.scope));});
