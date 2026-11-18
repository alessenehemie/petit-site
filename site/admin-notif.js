// Active les notifications sur CET appareil / navigateur pour être prévenu quand Soraya écrit.
(function () {
  const b64 = s => { const r = atob((s + '='.repeat((4 - s.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(r, c => c.charCodeAt(0)); };
  window.activerNotifsAdmin = async function () {
    try {
      if (!pwd) { alert("Connecte-toi d'abord."); return; }
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const appli = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
      if (ios && !appli) { alert("Sur iPhone : touche Partager, puis « Sur l'écran d'accueil », ouvre le site depuis cette icône (adresse /admin.html), puis réessaie."); return; }
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) { alert('Ce navigateur ne gère pas les notifications.'); return; }
      if (await Notification.requestPermission() !== 'granted') { alert('Les notifications sont refusées. Autorise-les dans les réglages du navigateur, puis réessaie.'); return; }
      const H = { 'x-admin-password': pwd };
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const rk = await fetch('/api/push', { headers: H }); if (!rk.ok) throw new Error();
      const { key } = await rk.json();
      const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) });
      const r = await fetch('/api/push', { method: 'POST', headers: { ...H, 'content-type': 'application/json' }, body: JSON.stringify(sub) });
      if (!r.ok) throw new Error();
      document.getElementById('btnNotifAdmin').textContent = '✅ Notifications activées sur cet appareil';
    } catch (e) { alert("Impossible d'activer les notifications pour le moment."); }
  };
})();
