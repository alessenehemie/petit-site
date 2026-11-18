// Suivi d'activité + blocage d'accès (voir /admin.html)
(function () {
  const send = e => { try { navigator.sendBeacon('/.netlify/functions/api?a=event', new Blob([JSON.stringify({ e })], { type: 'application/json' })); } catch (_) {} };
  if (typeof CONTENU_CHIFFRE !== 'undefined' && CONTENU_CHIFFRE && CONTENU_CHIFFRE.bloque) {
    document.body.innerHTML = '<section class="card on"><div class="big">🔒</div><h1>Accès suspendu</h1><p>Ce site est temporairement indisponible.</p></section>';
    send('Visite pendant le blocage'); return;
  }
  send('Visite du site');
  const N = { sNo: 'A répondu « Non » (pas Soraya)', s3: 'Code correct', sEnv: 'Enveloppe affichée', s4: 'Message du jour ouvert',
    sBq: 'Bouquet atteint (message aimé)', sSad: 'A répondu « Pas trop… »', sHist: 'Messages précédents', sOpen: 'Ouvre quand…', sTime: 'Notre histoire', sNuit: 'Message de bonne nuit' };
  const vu = {};
  new MutationObserver(ms => ms.forEach(m => {
    const t = m.target;
    if (t.classList && t.classList.contains('card') && t.classList.contains('on') && N[t.id] && !vu[t.id]) { vu[t.id] = 1; send(N[t.id]); }
  })).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
})();
