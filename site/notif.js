// Active les notifications sur le téléphone de Soraya (utilise la clé de chat pour s'identifier).
(function () {
  const b64 = s => { const r = atob((s + '='.repeat((4 - s.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(r, c => c.charCodeAt(0)); };
  window.activerNotifs = async function () {
    try {
      if (!CHAT_KEY) { alert('Entre d\'abord ton code 💗'); return; }
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const appli = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
      if (ios && !appli) { alert("Sur iPhone : touche le bouton Partager, puis « Sur l'écran d'accueil ». Ouvre ensuite le site depuis cette nouvelle icône et reviens ici."); return; }
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) { alert('Ce navigateur ne gère pas les notifications.'); return; }
      if (await Notification.requestPermission() !== 'granted') { alert('Les notifications sont refusées. Autorise-les dans les réglages du navigateur, puis réessaie.'); return; }
      const H = { 'x-chat-token': await ChatUI.token(CHAT_KEY) };
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const rk = await fetch('/api/push', { headers: H }); if (!rk.ok) throw new Error();
      const { key } = await rk.json();
      const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) });
      const r = await fetch('/api/push', { method: 'POST', headers: { ...H, 'content-type': 'application/json' }, body: JSON.stringify(sub) });
      if (!r.ok) throw new Error();
      alert('Notifications activées 💗');
    } catch (e) { alert("Impossible d'activer les notifications pour le moment."); }
  };
})();
