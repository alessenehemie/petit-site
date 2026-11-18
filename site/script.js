// ===== Réglages optionnels =====
// Fichier de musique douce placé dans le même dossier (ex : "musique.mp3"). Vide = pas de musique.
const MUSIC_FILE = "";
// Indice affiché après 3 erreurs de code. Modifie-le à ta façon (il est visible de tous : n'y écris pas le code !).
const INDICE = "Indice 💡 : pense à ton petit surnom doux, à ce qu'on se dit souvent, et à ce qui bat dans ta poitrine 💓";

// ===== Contenu secret =====
// Les messages, les lettres « Ouvre quand… », « Notre histoire » et le numéro WhatsApp ne sont PLUS écrits ici :
// ils sont chiffrés dans contenu.enc.js et se déverrouillent avec le code secret (voir textes.js et chiffrer.js).
let MESSAGES = [], MESSAGES_NUIT = [], LETTRES = [], CUSTOM_MOMENTS = [], WHATSAPP_NUMBER = '';

// ===== Navigation entre les étapes =====
const $ = id => document.getElementById(id);
let cur = 's1';

let goTimer;
// Change d'écran avec un fondu de sortie. Le callback (cb) s'exécute une fois le nouvel écran affiché.
function go(id, cb){
  clearTimeout(goTimer);
  const old = $(cur), next = $(id);
  const swap = () => {
    document.querySelectorAll('.card').forEach(c => c.classList.remove('on', 'out'));
    next.classList.add('on');
    cur = id;
    if (cb) cb();
  };
  if (old === next || !old.classList.contains('on') || matchMedia('(prefers-reduced-motion: reduce)').matches) return swap();
  old.classList.add('out');
  goTimer = setTimeout(swap, 250);
}
function shake(){
  const e = $(cur);
  e.classList.remove('shake');
  void e.offsetWidth;
  e.classList.add('shake');
}

// Étape 1 : êtes-vous Soraya ?
function isSoraya(oui){ go(oui ? 's2' : 'sNo'); }

// ===== Déverrouillage du contenu chiffré =====
// Le code secret sert de clé : PBKDF2 (200 000 tours) puis AES-GCM. Un mauvais code fait échouer le déchiffrement.
const deB64 = x => Uint8Array.from(atob(x), c => c.charCodeAt(0));
async function ouvrirContenu(code){
  if (!(window.crypto && crypto.subtle)) throw new Error('nocrypto');
  const C = CONTENU_CHIFFRE;
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveKey']);
  const cle = await crypto.subtle.deriveKey({name:'PBKDF2', salt:deB64(C.salt), iterations:C.iter, hash:'SHA-256'}, base, {name:'AES-GCM', length:256}, false, ['decrypt']);
  const clair = await crypto.subtle.decrypt({name:'AES-GCM', iv:deB64(C.iv)}, cle, deB64(C.data));
  return JSON.parse(new TextDecoder().decode(clair));
}
function appliquerContenu(d){
  MESSAGES = d.messages; MESSAGES_NUIT = d.nuit; LETTRES = d.lettres;
  CUSTOM_MOMENTS = d.moments || []; WHATSAPP_NUMBER = d.whatsapp || '';
  $('wa').hidden = !WHATSAPP_NUMBER;
}

// Étape 2 : le code
$('code').addEventListener('keydown', e => { if(e.key === 'Enter') checkCode(); });
let echecs = 0, enCours = false;
async function checkCode(){
  const v = $('code').value.trim().toLowerCase();
  if(!v){ $('err').textContent = 'Entre le code, mon cœur 💗'; shake(); return; }
  if (enCours) return;
  enCours = true; $('err').textContent = 'Un instant… 💗';
  let d = null, nocrypto = false;
  try { d = await ouvrirContenu(v); }
  catch(e){ nocrypto = !!(e && e.message === 'nocrypto'); }
  enCours = false;
  if (d){
    appliquerContenu(d);
    try { localStorage.setItem('codeSecret', v); } catch(e){}   // pour ne pas retaper le code sur cet appareil
    $('err').textContent = ''; $('hint').textContent = ''; echecs = 0;
    go('s3'); burst();
  } else if (nocrypto){
    $('err').textContent = "Ce site doit être ouvert en https pour s'ouvrir 💗";
  } else {
    echecs++;
    $('err').textContent = 'Code incorrect 💔 Réessaie…';
    if (echecs >= 3) $('hint').textContent = INDICE;
    shake(); $('code').select();
  }
}

// Si le code a déjà été validé sur cet appareil, on le réessaie en silence et on saute à l'étape 3.
// (Pour retrouver l'écran du code en test : dans la console, localStorage.removeItem('codeSecret') puis recharge.)
(async function(){
  let saved = null; try { saved = localStorage.getItem('codeSecret'); } catch(e){}
  if (!saved) return;
  $('s1').classList.remove('on');            // évite d'afficher l'écran 1 pendant le déchiffrement
  try {
    appliquerContenu(await ouvrirContenu(saved));
    $('s3').classList.add('on'); cur = 's3';
  } catch(e){
    if (!(e && e.message === 'nocrypto')) { try { localStorage.removeItem('codeSecret'); } catch(x){} }
    $('s1').classList.add('on');
  }
})();

// Étape 3 : Nissi a-t-il dit « je t'aime » ?
function said(oui){ go(oui ? 'sYes' : 'sNon'); }

// ===== Message du jour (change chaque jour, date locale) =====
// Jour 1 = premier message. Change cette date pour choisir le jour où le message n°1 s'affiche.
const START_DATE = Date.UTC(2026, 9, 15); // 15 octobre 2026 (mois : 0 = janvier)
// Date de début de votre couple : 26 décembre 2025 (sert au compteur de jours et aux anniversaires du 26)
const COUPLE_DATE = Date.UTC(2025, 11, 26);
function dayIndex(){
  const d = new Date();
  return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - START_DATE) / 86400000);
}
function showMsg(){
  const L = MESSAGES.length;
  const i = ((dayIndex() % L) + L) % L;
  const t = new Date();
  const jours = Math.floor((Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()) - COUPLE_DATE) / 86400000);
  const mois = (t.getFullYear() - 2025) * 12 + (t.getMonth() - 11) - (t.getDate() < 26 ? 1 : 0);
  let bonus = '';
  if (t.getDate() === 26 && mois > 0){
    bonus = (mois % 12 === 0)
      ? `🎉 Joyeux anniversaire à nous ! Déjà ${mois/12} an${mois/12 > 1 ? 's' : ''} ensemble 💍\n\n`
      : `🎉 Aujourd'hui, ça fait ${mois} mois qu'on est ensemble, mon amour !\n\n`;
  }
  curText = bonus + MESSAGES[i];
  $('date').textContent = t.toLocaleDateString('fr-FR', {weekday:'long', day:'numeric', month:'long', year:'numeric'}) + (jours > 0 ? ' · ensemble depuis ' + jours + ' jours 💗' : '');
  $('env').classList.remove('open'); $('hello').textContent = HELLO[skyKind()]; setSky();
  toggleMore(false);
  go('sEnv'); burst();
}

// Étape finale : aime-t-elle le message ?
function liked(oui){
  if(oui){ buildBouquet(); go('sBq'); burst(40); heartBoom(); }
  else go('sSad');
}

// ===== Cœurs et fleurs flottants =====
const EM = ['💖','💗','🌸','🌷','💕','🌹','💞','🌺','✨'];
function floater(){
  const e = document.createElement('span');
  e.className = 'fl';
  e.textContent = EM[Math.random() * EM.length | 0];
  e.style.left = Math.random() * 100 + 'vw';
  e.style.fontSize = (14 + Math.random() * 26) + 'px';
  e.style.animationDuration = (6 + Math.random() * 7) + 's';
  $('fx').appendChild(e);
  setTimeout(() => e.remove(), 14000);
}
function burst(n = 18){ for(let i = 0; i < n; i++) setTimeout(floater, i * 60); }
setInterval(floater, 600);
burst();

// ===== Bouquet animé (SVG) =====
function flower(x, y, r, c, d){
  let p = '';
  for(let a = 0; a < 360; a += 60) p += `<ellipse cx="0" cy="${-r}" rx="${r*.6}" ry="${r}" fill="${c}" transform="rotate(${a})"/>`;
  // .f = éclosion, .sway = léger balancement en boucle une fois la fleur ouverte
  return `<g transform="translate(${x} ${y})"><g class="f" style="animation-delay:${d}s"><g class="sway" style="animation-delay:${d + 1.4}s">${p}<circle r="${r*.5}" fill="#ffd34e"/></g></g></g>`;
}
function buildBouquet(){
  const st = [[100,200,100,95],[100,200,60,110],[100,200,140,110],[100,200,78,70],[100,200,122,70]];
  const tiges = st.map((a, i) => `<path class="s" d="M${a[0]} ${a[1]} Q${a[0]} ${a[1]-50} ${a[2]} ${a[3]}" stroke="#3f9b5a" stroke-width="4" fill="none" style="animation-delay:${i*.15}s"/>`).join('');
  const cols = ['#ff4f9a','#ff8fc2','#ff6b6b','#ffb3d9','#e0489b'];
  const fleurs = [[100,95,22],[60,110,18],[140,110,18],[78,70,16],[122,70,16]].map((f, i) => flower(f[0], f[1], f[2], cols[i], .8 + i*.35)).join('');
  $('bq').innerHTML = tiges + `<path d="M60 195 L140 195 L120 215 L80 215Z" fill="#ff8fc2"/>` + fleurs;
  bouquetLife();
}

// Papillons autour du bouquet + pétales qui tombent tant que l'écran du bouquet est affiché
let petalTimer;
function bouquetLife(){
  const card = $('sBq');
  card.querySelectorAll('.bfly').forEach(b => b.remove());
  clearInterval(petalTimer);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  [1, 2].forEach(n => {
    const b = document.createElement('span');
    b.className = 'bfly b' + n; b.textContent = '🦋';
    b.style.animationDelay = (1.5 + n * 1.2) + 's';
    card.appendChild(b);
  });
  petalTimer = setInterval(() => {
    if (cur !== 'sBq' || document.hidden) return;
    const p = document.createElement('span');
    p.className = 'pet'; p.textContent = ['🌸', '🌷', '🌺'][Math.random() * 3 | 0];
    p.style.cssText = `left:${Math.random()*100}vw;font-size:${12 + Math.random()*14}px;animation-duration:${6 + Math.random()*4}s;--sx:${(Math.random()-.5)*160}px`;
    $('boom').appendChild(p); setTimeout(() => p.remove(), 11000);
  }, 700);
}


// ===== Thème clair / sombre =====
(function(){
  const root = document.documentElement, b = $('theme');
  let saved = null; try { saved = localStorage.getItem('theme'); } catch(e){}
  const dark = () => root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  const paint = () => { b.textContent = dark() ? '☀️' : '🌙'; };
  if (saved) root.dataset.theme = saved;
  paint();
  b.onclick = () => { const n = dark() ? 'light' : 'dark'; root.dataset.theme = n; try { localStorage.setItem('theme', n); } catch(e){} paint(); };
})();

// ===== Texte du message du jour (rempli par showMsg) =====
let curText = '';

// ===== Compteur en direct =====
function updateLive(){
  const e = $('live'); if (!e) return;
  const s = Math.max(0, Math.floor((Date.now() - COUPLE_DATE) / 1000));
  e.textContent = `Ensemble depuis ${Math.floor(s/86400)} jours, ${Math.floor(s%86400/3600)} h, ${Math.floor(s%3600/60)} min et ${s%60} s 💞`;
}
setInterval(updateLive, 1000); updateLive();

// ===== Mise en page d'un message en « lettre » =====
// Découpe le texte en paragraphes ; la salutation (« Ma Soraya, ») est mise en valeur et le premier paragraphe reçoit une lettrine.
function ecrire(el, texte){
  el.textContent = '';
  let salut = false;
  String(texte).split(/\n\s*\n/).forEach(par => {
    const t = par.trim(); if (!t) return;
    const p = document.createElement('p');
    p.textContent = t;
    if (!salut && /^[^\n]{1,45},$/.test(t)) { p.className = 'salut'; salut = true; }
    el.appendChild(p);
  });
}

// ===== Menu « Plus de douceurs » (écran du message du jour) =====
function toggleMore(force){
  const m = $('more'), b = $('moreBtn');
  const ouvrir = typeof force === 'boolean' ? force : m.hidden;
  m.hidden = !ouvrir;
  b.setAttribute('aria-expanded', String(ouvrir));
  b.textContent = ouvrir ? 'Moins ▲' : 'Plus de douceurs 💗';
  if (ouvrir) m.scrollIntoView({behavior: 'smooth', block: 'nearest'});
}

// ===== Copier, bisou WhatsApp, musique =====
async function copyMsg(btn){
  const txt = curText + '\n\n— Ton Nissi 💋';
  try { await navigator.clipboard.writeText(txt); }
  catch(e){ const t = document.createElement('textarea'); t.value = txt; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
  const old = btn.textContent; btn.textContent = 'Copié ✅'; setTimeout(() => btn.textContent = old, 2000);
}
function sendKiss(){
  open('https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent("Je viens de lire mon message du jour 🥰 Je t'aime Nissi 💗😘"), '_blank');
}
if (MUSIC_FILE){
  const a = $('music'), b = $('musicBtn'); a.src = MUSIC_FILE; b.hidden = false;
  b.onclick = () => { if (a.paused) { a.play(); b.textContent = '🔊'; } else { a.pause(); b.textContent = '🎵'; } };
}

// ===== Explosion de cœurs =====
function heartBoom(){
  const c = $('boom'), E = ['💖','💗','💕','💘','🌸','❤️','💞'];
  for (let i = 0; i < 70; i++){
    const s = document.createElement('span'), a = Math.random() * Math.PI * 2, r = 120 + Math.random() * (innerWidth < 600 ? 160 : 320);
    s.className = 'pop'; s.textContent = E[Math.random() * E.length | 0];
    s.style.cssText = `--dx:${Math.cos(a)*r}px;--dy:${Math.sin(a)*r-80}px;--rot:${Math.random()*720-360}deg;font-size:${16+Math.random()*24}px;animation-delay:${Math.random()*.3}s`;
    c.appendChild(s); setTimeout(() => s.remove(), 2700);
  }
}

// ===== Messages précédents + coups de cœur =====
function favs(){ try { return JSON.parse(localStorage.getItem('favs') || '[]'); } catch(e){ return []; } }
function setFavs(f){ try { localStorage.setItem('favs', JSON.stringify(f)); } catch(e){} }
let onlyFav = false;
function showHistory(){
  const L = MESSAGES.length, n = Math.max(0, Math.min(dayIndex() + 1, L)), f = favs(), box = $('histList');
  box.textContent = '';
  for (let k = n - 1; k >= 0; k--){
    if (onlyFav && !f.includes(k)) continue;
    const d = document.createElement('details'), s = document.createElement('summary'), p = document.createElement('p'), h = document.createElement('button');
    s.textContent = (f.includes(k) ? '❤️ ' : '') + 'Jour ' + (k + 1) + ' · ' + new Date(START_DATE + k * 86400000).toLocaleDateString('fr-FR', {day:'numeric', month:'long', timeZone:'UTC'});
    p.className = 'hm'; p.textContent = MESSAGES[k];
    h.className = 'alt small'; h.textContent = f.includes(k) ? 'Retirer des coups de cœur' : 'Coup de cœur ❤️';
    h.onclick = () => { const g = favs(), x = g.indexOf(k); x < 0 ? g.push(k) : g.splice(x, 1); setFavs(g); showHistory(); };
    d.append(s, p, h); box.appendChild(d);
  }
  if (!box.children.length) box.textContent = onlyFav ? 'Aucun coup de cœur pour le moment 💗' : 'Pas encore de messages passés 💗';
  $('favBtn').textContent = onlyFav ? 'Voir tous les messages' : 'Voir mes ❤️';
  go('sHist');
}
function toggleFav(){ onlyFav = !onlyFav; showHistory(); }


// ===== Enveloppe =====
function openEnv(){
  const e = $('env'); if (e.classList.contains('open')) return;
  e.classList.add('open'); heartBoom();
  heartbeat();
  setTimeout(() => go('s4', () => { prepareScratch(); burst(); }), 1900);
}

// ===== Cœurs sous le doigt / la souris =====
function tapHearts(x, y, n = 6){
  const c = $('boom'), E = ['💖','💗','💕','💞'];
  for (let i = 0; i < n; i++){
    const s = document.createElement('span'); s.className = 'tp'; s.textContent = E[i % 4];
    s.style.cssText = `left:${x}px;top:${y}px;--dx:${(Math.random()-.5)*120}px;--dy:${-40-Math.random()*90}px;font-size:${14+Math.random()*12}px`;
    c.appendChild(s); setTimeout(() => s.remove(), 1000);
  }
}
addEventListener('pointerdown', e => tapHearts(e.clientX, e.clientY));
let lastMove = 0;
addEventListener('pointermove', e => { if (e.pointerType === 'mouse' && Date.now() - lastMove > 90){ lastMove = Date.now(); tapHearts(e.clientX, e.clientY, 1); } });

// ===== Ciel qui change avec l'heure =====
function skyKind(){ const h = new Date().getHours(); return h >= 5 && h < 11 ? 'morning' : h >= 11 && h < 18 ? 'day' : h >= 18 && h < 21 ? 'evening' : 'night'; }
const HELLO = {morning:'Bonjour ma Soraya ☀️', day:'Bon après-midi ma Soraya 🌼', evening:'Bonsoir ma Soraya 🌇', night:'Bonne nuit mon amour 🌙'};
function setSky(){
  const k = skyKind(), s = $('sky'); s.className = k; s.textContent = '';
  if (k === 'night' || k === 'evening'){
    for (let i = 0; i < (k === 'night' ? 70 : 25); i++){
      const t = document.createElement('i'), z = 1 + Math.random() * 2.5;
      t.style.cssText = `left:${Math.random()*100}%;top:${Math.random()*70}%;width:${z}px;height:${z}px;animation-delay:${Math.random()*4}s`;
      s.appendChild(t);
    }
  }
  if (k === 'night'){
    for (let i = 0; i < 3; i++){
      const b = document.createElement('b');
      b.style.cssText = `left:${Math.random()*50}%;top:${Math.random()*35}%;animation-delay:${i*3+Math.random()*3}s`;
      s.appendChild(b);
    }
  }
}
setSky();


// ===== Carte à gratter =====
function prepareScratch(){
  const w = $('sw'), c = $('scratch'), x = c.getContext('2d');
  ecrire($('msg'), curText); $('msg').style.minHeight = '';
  c.classList.remove('gone'); c.style.display = 'block'; $('skipBtn').hidden = false;
  c.width = w.offsetWidth; c.height = w.offsetHeight;
  const g = x.createLinearGradient(0, 0, c.width, c.height);
  g.addColorStop(0, '#ff9ec7'); g.addColorStop(.5, '#ffc2dd'); g.addColorStop(1, '#ff6fae');
  x.globalCompositeOperation = 'source-over'; x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
  x.font = '28px serif'; x.globalAlpha = .55;
  for (let i = 0; i < 40; i++) x.fillText(['💗','🌸','💕'][i % 3], Math.random() * c.width, Math.random() * c.height + 20);
  x.globalAlpha = 1; x.fillStyle = '#fff'; x.textAlign = 'center'; x.font = '700 28px "Dancing Script", cursive, serif';
  x.fillText('Gratte pour lire 💌', c.width / 2, c.height / 2);
}
function reveal(){
  const c = $('scratch'); if (c.classList.contains('gone')) return;
  c.classList.add('gone'); $('skipBtn').hidden = true; heartBoom();
  setTimeout(() => { c.style.display = 'none'; }, 750);
}
(function(){
  const c = $('scratch'), x = c.getContext('2d'); let down = false, n = 0;
  const draw = e => {
    if (!down) return;
    const r = c.getBoundingClientRect();
    x.globalCompositeOperation = 'destination-out'; x.beginPath(); x.arc(e.clientX - r.left, e.clientY - r.top, 24, 0, 7); x.fill();
    if (++n % 8 === 0) check();
  };
  function check(){
    const d = x.getImageData(0, 0, c.width, c.height).data; let t = 0, k = 0;
    for (let i = 3; i < d.length; i += 64){ k++; if (d[i] < 40) t++; }
    if (t / k > .5) reveal();
  }
  c.addEventListener('pointerdown', e => { down = true; c.setPointerCapture(e.pointerId); draw(e); });
  c.addEventListener('pointermove', draw);
  c.addEventListener('pointerup', () => down = false);
  c.addEventListener('pointercancel', () => down = false);
})();

// ===== Ouvre quand… =====
// (les lettres sont dans le contenu chiffré : voir textes.js)
function showOpen(){
  const l = $('openList');
  if (!l.children.length) LETTRES.forEach(x => {
    const b = document.createElement('button'); b.className = 'alt'; b.textContent = x.t;
    b.onclick = () => { const m = $('openText'); m.hidden = false; ecrire(m, x.m); m.scrollTop = 0; burst(12); };
    l.appendChild(b);
  });
  $('openText').hidden = true; go('sOpen');
}

// ===== Notre histoire (frise du temps) =====
// Les moments importants à ajouter se mettent dans textes.js (rubrique « moments »), pas ici.
function showTimeline(){
  const t = new Date(), today = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
  const ev = [{d: COUPLE_DATE, t: 'Le jour où on est devenus nous 💞'}];
  for (let m = 1; m <= 12; m++) ev.push({d: Date.UTC(2025, 11 + m, 26), t: m === 12 ? '1 an ensemble ! Joyeux anniversaire à nous 💍' : m + ' mois ensemble 🎉'});
  [100, 200, 300].forEach(n => ev.push({d: COUPLE_DATE + n * 86400000, t: n + ' jours ensemble ✨'}));
  CUSTOM_MOMENTS.forEach(c => { const d = Date.parse(c.date + 'T00:00:00Z'); if (!isNaN(d)) ev.push({d, t: c.text}); });
  ev.sort((a, b) => a.d - b.d);
  const box = $('timeList'); box.textContent = ''; let fut = 0;
  ev.forEach(e => {
    const past = e.d <= today; if (!past && ++fut > 2) return;
    const r = document.createElement('div'), b = document.createElement('b'), s = document.createElement('span');
    r.className = 'tl' + (past ? '' : fut === 1 ? ' next' : ' fut');
    b.textContent = new Date(e.d).toLocaleDateString('fr-FR', {day:'numeric', month:'short', year:'numeric', timeZone:'UTC'});
    s.textContent = (past ? '✅ ' : '⏳ ') + e.t + (past ? '' : ' (dans ' + Math.round((e.d - today) / 86400000) + ' jours)');
    r.append(b, s); box.appendChild(r);
  });
  go('sTime');
}


// ===== Battement de cœur : vibration (Android), petit tapotement (iPhone récent) et flash rose pour tous =====
function heartbeat(){
  let ok = false;
  try { ok = navigator.vibrate ? navigator.vibrate([60, 90, 60]) : false; } catch(x){}
  if (!ok) iosTick();
  const f = document.createElement('div'); f.className = 'beat';
  $('boom').appendChild(f); setTimeout(() => f.remove(), 900);
}
function iosTick(){
  try {
    let l = $('hapt');
    if (!l){
      l = document.createElement('label'); l.id = 'hapt'; l.setAttribute('aria-hidden', 'true');
      l.style.cssText = 'position:fixed;left:-99px;top:0;opacity:0;pointer-events:none';
      const i = document.createElement('input'); i.type = 'checkbox'; i.setAttribute('switch', '');
      l.appendChild(i); document.body.appendChild(l);
    }
    l.click(); setTimeout(() => l.click(), 160);
  } catch(x){}
}