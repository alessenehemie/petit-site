'use strict';
// ===== Administration du site pour Soraya =====
// Tout est chiffré ICI, dans ton navigateur : le serveur ne reçoit que du contenu chiffré,
// jamais tes textes en clair ni le code secret.

const $ = id => document.getElementById(id);
const START_DATE = Date.UTC(2026, 9, 15);       // le message n°1 s'affiche le 15 octobre 2026 (comme sur le site)
const ITER = 200000;

// <crypto>
const enc = new TextEncoder(), dec = new TextDecoder();
const norm = s => String(s).trim().toLowerCase();   // même normalisation que sur le site
function toB64(u8){
  let s = ''; const n = 0x8000;
  for (let i = 0; i < u8.length; i += n) s += String.fromCharCode.apply(null, u8.subarray(i, i + n));
  return btoa(s);
}
const fromB64 = x => Uint8Array.from(atob(x), c => c.charCodeAt(0));
async function cle(code, salt, iter, usage){
  const base = await crypto.subtle.importKey('raw', enc.encode(code), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256'}, base, {name: 'AES-GCM', length: 256}, false, usage);
}
async function ouvrir(C, code){
  const clair = await crypto.subtle.decrypt({name: 'AES-GCM', iv: fromB64(C.iv)}, await cle(code, fromB64(C.salt), C.iter, ['decrypt']), fromB64(C.data));
  return JSON.parse(dec.decode(clair));
}
async function sceller(code, data){
  const payload = JSON.stringify(data);
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const buf = new Uint8Array(await crypto.subtle.encrypt({name: 'AES-GCM', iv}, await cle(code, salt, ITER, ['encrypt']), enc.encode(payload)));
  const C = {v: 1, iter: ITER, salt: toB64(salt), iv: toB64(iv), data: toB64(buf)};
  // Contrôle : on redéchiffre pour être sûr que le fichier est bon.
  if (JSON.stringify(await ouvrir(C, code)) !== payload) throw new Error('Vérification du chiffrement échouée.');
  return C;
}
// </crypto>

// ----- État -----
let D = null;            // les textes en clair : {messages, nuit, lettres, moments, whatsapp}
let code = '', pwd = ''; // code secret actuel et mot de passe admin (gardés en mémoire seulement)
let dirty = false;

function el(tag, cls, text){
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
const hdr = () => ({'x-admin-password': pwd});

// ----- Discussion -----
let chatAdmin = null, tabCourant = 'messages';
function demarrerChat(){
  if (chatAdmin || !D.chatKey) return;
  chatAdmin = ChatUI({
    box: $('adminChat'), keyB64: D.chatKey, me: 'admin',
    headers: () => ({'x-admin-password': pwd}),
    isActive: () => tabCourant === 'discussion',
    onUnread: n => { $('cChat').textContent = n ? '(' + n + ')' : ''; document.title = (n ? '(' + n + ') ' : '') + 'Administration 💗'; }
  });
  $('chatWait').hidden = true;
  chatAdmin.start();
}
// Envoie le contenu chiffré ET l'empreinte du jeton de Soraya (le serveur ne reçoit jamais la clé de chat).
async function envoyerContenu(data, codeUtilise){
  data.chatKey = D.chatKey;
  const C = await sceller(codeUtilise, data);
  const chatTokenHash = await ChatUI.tokenHash(await ChatUI.token(D.chatKey));
  const r = await fetch('/api/content', {method: 'PUT', headers: {'content-type': 'application/json', ...hdr()}, body: JSON.stringify({...C, chatTokenHash})});
  if (!r.ok){ let m = ''; try { m = (await r.json()).error; } catch(e){} throw new Error(m || 'Erreur ' + r.status); }
}
// Première fois : une clé de chat est créée puis publiée toute seule.
async function activerChat(){
  statut('Activation de la discussion…');
  try { await envoyerContenu(preparer(), code); statut('✅ Discussion activée.', 'ok'); demarrerChat(); }
  catch(e){ statut('❌ Discussion non activée : ' + e.message, 'err'); }
}

// ----- Connexion -----
$('btnLogin').onclick = connexion;
['inCode', 'inPwd'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter') connexion(); }));

async function connexion(){
  const c = norm($('inCode').value), p = $('inPwd').value, err = $('loginErr'), btn = $('btnLogin');
  err.textContent = '';
  if (!c || !p){ err.textContent = 'Remplis les deux champs.'; return; }
  if (!(window.crypto && crypto.subtle)){ err.textContent = 'Ouvre cette page en https.'; return; }
  btn.disabled = true; err.textContent = 'Vérification…';
  try {
    // 1) mot de passe administrateur (on en profite pour récupérer l'activité)
    const ra = await fetch('/api/activity', {headers: {'x-admin-password': p}, cache: 'no-store'});
    if (ra.status === 401) throw new Error('Mot de passe administrateur incorrect.');
    if (!ra.ok){
      let m = ''; try { m = (await ra.json()).error; } catch(e){}
      throw new Error(m || 'Le serveur ne répond pas (erreur ' + ra.status + '). Les fonctions Netlify sont-elles déployées ?');
    }
    const act = await ra.json();

    // 2) contenu chiffré : celui du serveur, ou à défaut (rien de publié encore) le fichier contenu.enc.js
    let C;
    const rc = await fetch('/api/content', {cache: 'no-store'});
    if (rc.ok) C = await rc.json();
    else if (rc.status === 404 && typeof CONTENU_CHIFFRE !== 'undefined') C = CONTENU_CHIFFRE;
    else throw new Error('Impossible de lire le contenu (erreur ' + rc.status + ').');

    // 3) déchiffrement avec le code secret
    try { D = await ouvrir(C, c); } catch(e){ throw new Error('Code secret incorrect.'); }
    D.messages = D.messages || []; D.nuit = D.nuit || []; D.lettres = D.lettres || [];
    D.moments = D.moments || []; D.whatsapp = D.whatsapp || '';
    let chatNeuf = false;
    if (!D.chatKey){ D.chatKey = ChatUI.newKey(); chatNeuf = true; }

    code = c; pwd = p;
    $('login').hidden = true; $('app').hidden = false;
    $('inCode').value = ''; $('inPwd').value = '';
    renderAll(); afficherActivite(act);
    if (chatNeuf) activerChat(); else demarrerChat();
  } catch(e){
    err.textContent = e.message;
  } finally {
    btn.disabled = false;
  }
}

// ----- Onglets -----
document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => {
  document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', x === b));
  document.querySelectorAll('.tab').forEach(t => t.hidden = t.id !== 'tab-' + b.dataset.tab);
  tabCourant = b.dataset.tab;
  $('bar').hidden = tabCourant === 'discussion';      // la barre « Publier » gênerait la zone d'écriture
  if (tabCourant === 'activite') chargerActivite();
  if (tabCourant === 'discussion' && chatAdmin) chatAdmin.opened();
  window.scrollTo(0, 0);
});

// ----- Modifications -----
function marquer(){
  dirty = true;
  const s = $('status'); s.textContent = 'Modifications non publiées.'; s.className = 'dirty';
  $('btnPublish').disabled = false;
}
addEventListener('beforeunload', e => { if (dirty){ e.preventDefault(); e.returnValue = ''; } });

function compter(){
  $('cMessages').textContent = '(' + D.messages.length + ')';
  $('cNuit').textContent = '(' + D.nuit.length + ')';
  $('cLettres').textContent = '(' + D.lettres.length + ')';
  $('cMoments').textContent = '(' + D.moments.length + ')';
}
const apercu = t => String(t).replace(/\s+/g, ' ').trim().slice(0, 90);
function indexAujourdhui(L){
  if (!L) return -1;
  const t = new Date();
  const d = Math.floor((Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()) - START_DATE) / 86400000);
  return ((d % L) + L) % L;
}
function deplacer(arr, i, sens){
  const j = i + sens;
  if (j < 0 || j >= arr.length) return false;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  return true;
}

// Barre de boutons commune à un élément (monter, descendre, supprimer).
function barre(arr, i, again){
  const row = el('div', 'row');
  const up = el('button', '', '↑ Monter'), down = el('button', '', '↓ Descendre'), del = el('button', 'danger', 'Supprimer');
  up.disabled = i === 0; down.disabled = i === arr.length - 1;
  up.onclick = () => { if (deplacer(arr, i, -1)){ marquer(); again(i - 1); } };
  down.onclick = () => { if (deplacer(arr, i, 1)){ marquer(); again(i + 1); } };
  del.onclick = () => { if (confirm('Supprimer cet élément ?')){ arr.splice(i, 1); marquer(); again(-1); } };
  row.append(up, down, del);
  return row;
}

// ----- Liste de textes simples (messages du jour, bonne nuit) -----
function renderTextes(key, boxId, prefixe, ouvert){
  const box = $(boxId), arr = D[key], auj = indexAujourdhui(arr.length);
  box.textContent = '';
  arr.forEach((txt, i) => {
    const d = el('details', 'item' + (i === auj ? ' today' : '')); if (i === ouvert) d.open = true;
    const s = el('summary'), pv = el('span', 'pv', apercu(txt));
    let titre = prefixe + ' ' + (i + 1);
    if (key === 'messages' && i < 400) titre += ' · ' + new Date(START_DATE + i * 86400000).toLocaleDateString('fr-FR', {day: 'numeric', month: 'short', timeZone: 'UTC'});
    if (i === auj) titre += ' · aujourd’hui';
    s.append(el('b', '', titre), pv);
    const body = el('div', 'body'), ta = el('textarea'); ta.value = txt;
    ta.oninput = () => { arr[i] = ta.value; pv.textContent = apercu(ta.value); marquer(); };
    body.append(ta, barre(arr, i, o => renderTextes(key, boxId, prefixe, o)));
    d.append(s, body); box.appendChild(d);
  });
  compter();
}

// ----- Lettres « Ouvre quand… » -----
function renderLettres(ouvert){
  const box = $('listLettres'), arr = D.lettres;
  box.textContent = '';
  arr.forEach((l, i) => {
    const d = el('details', 'item'); if (i === ouvert) d.open = true;
    const s = el('summary'), tt = el('b', '', l.t || '(sans titre)');
    s.append(tt);
    const body = el('div', 'body');
    const inT = el('input'); inT.type = 'text'; inT.value = l.t; inT.placeholder = 'Titre du bouton (ex : Ouvre quand tu es triste 🥺)';
    inT.oninput = () => { l.t = inT.value; tt.textContent = l.t || '(sans titre)'; marquer(); };
    const ta = el('textarea'); ta.value = l.m;
    ta.oninput = () => { l.m = ta.value; marquer(); };
    body.append(inT, ta, barre(arr, i, renderLettres));
    d.append(s, body); box.appendChild(d);
  });
  compter();
}

// ----- Moments de « Notre histoire » -----
function renderMoments(){
  const box = $('listMoments'), arr = D.moments;
  box.textContent = '';
  arr.forEach((m, i) => {
    const r = el('div', 'moment');
    const dt = el('input'); dt.type = 'date'; dt.value = m.date;
    dt.oninput = () => { m.date = dt.value; marquer(); };
    const tx = el('input'); tx.type = 'text'; tx.value = m.text; tx.placeholder = 'Ex : Notre premier appel vidéo 💗';
    tx.oninput = () => { m.text = tx.value; marquer(); };
    const del = el('button', 'danger', '✕'); del.title = 'Supprimer';
    del.onclick = () => { arr.splice(i, 1); marquer(); renderMoments(); };
    r.append(dt, tx, del); box.appendChild(r);
  });
  compter();
}

$('addMessages').onclick = () => { D.messages.push(''); marquer(); renderTextes('messages', 'listMessages', 'Jour', D.messages.length - 1); focusDernier('listMessages'); };
$('addNuit').onclick = () => { D.nuit.push(''); marquer(); renderTextes('nuit', 'listNuit', 'Nuit', D.nuit.length - 1); focusDernier('listNuit'); };
$('addLettres').onclick = () => { D.lettres.push({t: '', m: ''}); marquer(); renderLettres(D.lettres.length - 1); focusDernier('listLettres'); };
$('addMoments').onclick = () => { D.moments.push({date: '', text: ''}); marquer(); renderMoments(); };
function focusDernier(boxId){
  const last = $(boxId).lastElementChild;
  if (last){ last.scrollIntoView({block: 'center'}); const f = last.querySelector('input,textarea'); if (f) f.focus(); }
}

// ----- Réglages -----
$('inWhatsapp').oninput = () => { D.whatsapp = $('inWhatsapp').value.replace(/\D/g, ''); marquer(); };
$('newCode').oninput = $('newCode2').oninput = marquer;

function renderAll(){
  renderTextes('messages', 'listMessages', 'Jour', -1);
  renderTextes('nuit', 'listNuit', 'Nuit', -1);
  renderLettres(-1);
  renderMoments();
  $('inWhatsapp').value = D.whatsapp;
  compter();
}

// ----- Vérification et préparation avant publication -----
function preparer(){
  for (const [k, nom] of [['messages', 'messages du jour'], ['nuit', 'messages de bonne nuit']]){
    if (!D[k].length) throw new Error('Il faut au moins un message dans « ' + nom + ' ».');
    const i = D[k].findIndex(s => !String(s).trim());
    if (i >= 0) throw new Error('Le message n°' + (i + 1) + ' (' + nom + ') est vide : écris-le ou supprime-le.');
  }
  if (!D.lettres.length) throw new Error('Il faut au moins une lettre « Ouvre quand… ».');
  const j = D.lettres.findIndex(l => !l.t.trim() || !l.m.trim());
  if (j >= 0) throw new Error('La lettre n°' + (j + 1) + ' (« Ouvre quand… ») a un titre ou un texte vide.');
  const moments = D.moments.filter(m => m.date || m.text.trim());
  const bad = moments.findIndex(m => !/^\d{4}-\d{2}-\d{2}$/.test(m.date) || !m.text.trim());
  if (bad >= 0) throw new Error('Un moment de « Notre histoire » est incomplet : il faut une date et un texte.');
  return {
    messages: D.messages.map(s => s.trim()),
    nuit: D.nuit.map(s => s.trim()),
    lettres: D.lettres.map(l => ({t: l.t.trim(), m: l.m.trim()})),
    moments: moments.map(m => ({date: m.date, text: m.text.trim()})),
    whatsapp: String(D.whatsapp || '').replace(/\D/g, ''),
    chatKey: D.chatKey
  };
}
function statut(msg, cls){ const s = $('status'); s.textContent = msg; s.className = cls || ''; }

// ----- Publication -----
$('btnPublish').onclick = async () => {
  let data, nouveau = code;
  try {
    data = preparer();
    const a = norm($('newCode').value), b = norm($('newCode2').value);
    if (a || b){
      if (a !== b) throw new Error('Les deux champs du nouveau code ne sont pas identiques (onglet Réglages).');
      if (a.length < 12 && !confirm('Ce code est court (moins de 12 caractères) : il protège moins bien tes messages. Continuer quand même ?')) return;
      if (!confirm('Tu changes le code secret. Soraya devra taper le NOUVEAU code (l\'ancien ne marchera plus). Continuer ?')) return;
      nouveau = a;
    }
  } catch(e){ statut(e.message, 'err'); return; }

  const btn = $('btnPublish'); btn.disabled = true; statut('Chiffrement et publication…');
  try {
    await envoyerContenu(data, nouveau);
    code = nouveau; dirty = false; demarrerChat();
    $('newCode').value = ''; $('newCode2').value = '';
    statut('✅ Publié à ' + new Date().toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'}) + '. Soraya verra les changements à sa prochaine ouverture.', 'ok');
    btn.disabled = true;
  } catch(e){
    statut('❌ Non publié : ' + e.message, 'err'); btn.disabled = false;
  }
};

// ----- Sauvegardes -----
function telecharger(nom, contenu, type){
  const a = el('a'); a.href = URL.createObjectURL(new Blob([contenu], {type})); a.download = nom;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
$('btnBackup').onclick = () => {
  const j = new Date().toISOString().slice(0, 10);
  telecharger('textes-sauvegarde-' + j + '.json', JSON.stringify(D, null, 2), 'application/json');
};
$('btnEncFile').onclick = async () => {
  try {
    const C = await sceller(code, preparer());
    telecharger('contenu.enc.js',
      '// Fichier généré par l\'administration : contenu chiffré (AES-GCM). Ne pas modifier à la main.\n' +
      'const CONTENU_CHIFFRE = ' + JSON.stringify(C) + ';\n', 'text/javascript');
  } catch(e){ statut(e.message, 'err'); }
};

// ----- Activité -----
async function chargerActivite(){
  $('actSummary').textContent = 'Chargement…';
  try {
    const r = await fetch('/api/activity', {headers: hdr(), cache: 'no-store'});
    if (!r.ok) throw new Error('Erreur ' + r.status);
    afficherActivite(await r.json());
  } catch(e){ $('actSummary').textContent = 'Impossible de charger l\'activité : ' + e.message; }
}
$('btnRefresh').onclick = chargerActivite;
$('btnClear').onclick = async () => {
  if (!confirm('Effacer tout l\'historique d\'activité ?')) return;
  try {
    const r = await fetch('/api/activity', {method: 'DELETE', headers: hdr()});
    if (!r.ok) throw new Error('Erreur ' + r.status);
    chargerActivite();
  } catch(e){ alert('Échec : ' + e.message); }
};

const quand = t => new Date(t).toLocaleString('fr-FR', {weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris'});
function texteEvenement(e){
  const n = Number.isInteger(e.i) ? e.i + 1 : '?';
  switch (e.type){
    case 'visit':  return '🔓 Elle est entrée sur le site';
    case 'open':   return '💌 Elle a ouvert le message du jour n°' + n;
    case 'like':   return e.on ? '💕 Elle a adoré le message n°' + n : '🥺 Elle a répondu « Pas trop… » au message n°' + n;
    case 'fav':    return e.on ? '❤️ Coup de cœur ajouté sur le message n°' + n : '💔 Coup de cœur retiré sur le message n°' + n;
    case 'night':  return '🌙 Elle a lu son mot de bonne nuit';
    case 'letter': return '💌 Elle a ouvert la lettre « ' + ((D.lettres[e.i] && D.lettres[e.i].t) || ('n°' + n)) + ' »';
    case 'kiss':   return '😘 Elle t\'a envoyé un bisou sur WhatsApp';
    default:       return e.type;
  }
}
function afficherActivite(a){
  const ev = a.events || [], sum = $('actSummary'), ul = $('actList');
  sum.textContent = ''; ul.textContent = '';
  const visites = ev.filter(e => e.type === 'visit'), likes = ev.filter(e => e.type === 'like');
  const cases = [
    [visites.length ? quand(visites[0].t) : '—', 'Dernière visite'],
    [visites.length, 'Visites'],
    [likes.filter(e => e.on).length + ' / ' + likes.length, 'Messages adorés'],
    [ev.filter(e => e.type === 'fav' && e.on).length, 'Coups de cœur']
  ];
  cases.forEach(([v, l]) => { const d = el('div'); d.append(el('b', '', String(v)), document.createTextNode(l)); sum.appendChild(d); });
  if (!ev.length){ ul.appendChild(el('li', '', 'Rien pour le moment 💗')); return; }
  ev.forEach(e => {
    const li = el('li'); li.append(el('time', '', quand(e.t)), document.createTextNode(texteEvenement(e)));
    ul.appendChild(li);
  });
  if (a.total > ev.length) ul.appendChild(el('li', '', '… et ' + (a.total - ev.length) + ' événements plus anciens.'));
}
