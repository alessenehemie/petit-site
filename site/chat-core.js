'use strict';
// ===== Discussion Soraya ↔ Nissi (partagé par le site et la page admin) =====
// Tout est chiffré dans le navigateur (AES-GCM) avec une clé de chat qui se trouve dans le contenu chiffré
// par le code secret : le serveur ne voit jamais les messages, photos, vidéos ou vocaux en clair.
(function () {
  const enc = new TextEncoder(), dec = new TextDecoder();
  const PART = 4 * 1024 * 1024;            // taille d'un morceau envoyé au serveur
  const MAX_BYTES = 40 * 1024 * 1024;      // taille maximale d'un média
  const MAX_REC = 180;                     // durée maximale d'un vocal (secondes)

  const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = x => Uint8Array.from(atob(x), c => c.charCodeAt(0));
  const hex = u8 => Array.from(u8, x => x.toString(16).padStart(2, '0')).join('');
  const sha = async bytes => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const mo = n => (n / 1048576 < 10 ? (n / 1048576).toFixed(1) : Math.round(n / 1048576)) + ' Mo';
  const mmss = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

  // --- Clé et jeton ---
  function newKey() { return b64(crypto.getRandomValues(new Uint8Array(32))); }
  async function token(keyB64) {       // jeton de Soraya, dérivé de la clé de chat
    const k = unb64(keyB64), x = new Uint8Array(k.length + 6);
    x.set(k); x.set(enc.encode('|token'), k.length);
    return hex(await sha(x));
  }
  const tokenHash = async t => hex(await sha(enc.encode(t)));   // empreinte envoyée au serveur par l'admin

  function ChatUI(o) {
    const root = o.box; root.textContent = ''; root.classList.add('chat');
    const list = el('div', 'chat-list'), info = el('div', 'chat-info');
    list.setAttribute('aria-live', 'polite'); info.setAttribute('role', 'status');
    const bar = el('div', 'chat-bar');
    const file = el('input'); file.type = 'file'; file.accept = 'image/*,video/*'; file.hidden = true;
    const bFile = el('button', 'chat-ico', '📎'), bMic = el('button', 'chat-ico', '🎤'), bSend = el('button', 'chat-send', '➤');
    bFile.title = 'Photo ou vidéo'; bMic.title = 'Message vocal'; bSend.title = 'Envoyer';
    bFile.setAttribute('aria-label', 'Envoyer une photo ou une vidéo'); bMic.setAttribute('aria-label', 'Enregistrer un vocal'); bSend.setAttribute('aria-label', 'Envoyer');
    const txt = el('textarea', 'chat-input'); txt.rows = 1; txt.placeholder = 'Écris un message…'; txt.maxLength = 3000;
    bar.append(bFile, txt, bMic, bSend, file);
    const recBar = el('div', 'chat-rec'); recBar.hidden = true;
    const recT = el('span', 'chat-rect', '🔴 0:00'), recX = el('button', 'chat-ico', '✕'), recOk = el('button', 'chat-send', '➤');
    recX.title = 'Annuler'; recOk.title = 'Envoyer le vocal';
    recBar.append(recX, recT, recOk);
    root.append(list, info, bar, recBar);

    const keyP = crypto.subtle.importKey('raw', unb64(o.keyB64), 'AES-GCM', false, ['encrypt', 'decrypt']);
    const shown = new Map(), blobs = new Map();
    let lastId = '', lastDay = '', busy = false, started = false, timer = 0, infoT = 0, sending = 0;
    const seenKey = 'chatSeen:' + o.me;
    const H = (extra) => Object.assign({}, o.headers(), extra || {});

    function say(msg, ms) { info.textContent = msg || ''; clearTimeout(infoT); if (msg && ms !== 0) infoT = setTimeout(() => { if (info.textContent === msg) info.textContent = ''; }, ms || 6000); }

    // --- Chiffrement ---
    async function encBytes(u8) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyP, u8));
      const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12); return out;
    }
    async function decBytes(u8) { return crypto.subtle.decrypt({ name: 'AES-GCM', iv: u8.subarray(0, 12) }, await keyP, u8.subarray(12)); }
    async function encObj(obj) { const s = await encBytes(enc.encode(JSON.stringify(obj))); return { iv: b64(s.subarray(0, 12)), data: b64(s.subarray(12)) }; }
    async function decObj(e) {
      const iv = unb64(e.iv), ct = unb64(e.data), all = new Uint8Array(12 + ct.length);
      all.set(iv); all.set(ct, 12);
      return JSON.parse(dec.decode(await decBytes(all)));
    }

    // --- Réseau ---
    async function api(path, init) {
      const r = await fetch(path, Object.assign({ cache: 'no-store' }, init, { headers: H(init && init.headers) }));
      if (!r.ok) {
        let m = ''; try { m = (await r.json()).error; } catch (e) {}
        throw new Error(m || 'Erreur ' + r.status);
      }
      return r.json();
    }

    // --- Médias ---
    async function loadMedia(mid, parts, mime, prog) {
      if (blobs.has(mid)) return blobs.get(mid);
      const chunks = []; let n = 0;
      for (let i = 0; i < parts; i++) {
        const r = await fetch('/api/chat-media?id=' + mid + '&part=' + i, { headers: H() });
        if (!r.ok) throw new Error('Média introuvable');
        const u = new Uint8Array(await r.arrayBuffer()); chunks.push(u); n += u.length;
        if (prog) prog(i + 1, parts);
      }
      const all = new Uint8Array(n); let p = 0; chunks.forEach(c => { all.set(c, p); p += c.length; });
      const url = URL.createObjectURL(new Blob([await decBytes(all)], { type: mime }));
      blobs.set(mid, url); return url;
    }
    function lightbox(url) {
      const d = el('div', 'chat-lb'), i = el('img'); i.src = url; d.appendChild(i);
      d.onclick = () => d.remove(); document.body.appendChild(d);
    }
    function mediaNode(m, obj) {
      const meta = obj.m || {}, box = el('div', 'chat-media');
      const retry = (fn, label) => { box.textContent = ''; const b = el('button', 'chat-load', label); b.onclick = fn; box.appendChild(b); };
      const show = async () => {
        box.textContent = '⏳ Chargement…';
        try {
          const url = await loadMedia(m.mid, m.parts, meta.mime || 'application/octet-stream', (a, b) => { if (b > 1) box.textContent = '⏳ ' + a + '/' + b; });
          box.textContent = '';
          if (obj.k === 'image') { const i = el('img'); i.src = url; i.alt = 'Photo'; i.onclick = () => lightbox(url); box.appendChild(i); }
          else if (obj.k === 'video') { const v = el('video'); v.src = url; v.controls = true; v.playsInline = true; v.preload = 'metadata'; box.appendChild(v); }
          else { const a = el('audio'); a.src = url; a.controls = true; box.appendChild(a); }
        } catch (e) { retry(show, '⚠️ Réessayer'); }
      };
      if (obj.k === 'video') retry(show, '▶ Vidéo' + (meta.size ? ' · ' + mo(meta.size) : ''));
      else show();
      return box;
    }

    // --- Affichage ---
    const nearBottom = () => list.scrollHeight - list.scrollTop - list.clientHeight < 120;
    const toBottom = () => { list.scrollTop = list.scrollHeight; };
    async function add(m) {
      const mine = m.from === o.me, row = el('div', 'chat-row ' + (mine ? 'me' : 'them')), b = el('div', 'chat-b');
      let obj = null;
      try { obj = await decObj(m.enc); } catch (e) {}
      if (!obj) b.appendChild(el('p', 'chat-lock', '🔒 Message illisible'));
      else if (obj.k === 'text') b.appendChild(el('p', '', String(obj.x)));
      else if (m.mid && (obj.k === 'image' || obj.k === 'video' || obj.k === 'audio')) b.appendChild(mediaNode(m, obj));
      else b.appendChild(el('p', 'chat-lock', '🔒 Message non pris en charge'));
      const meta = el('div', 'chat-meta');
      const d = new Date(m.t), day = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
      if (day !== lastDay) { lastDay = day; list.appendChild(el('div', 'chat-day', day)); }
      meta.appendChild(el('span', '', d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })));
      if (mine || o.me === 'admin') {
        const del = el('button', 'chat-del', '🗑'); del.title = 'Supprimer'; del.setAttribute('aria-label', 'Supprimer ce message');
        del.onclick = async () => {
          if (!confirm('Supprimer ce message pour vous deux ?')) return;
          try { await api('/api/chat?id=' + m.id, { method: 'DELETE' }); row.remove(); shown.delete(m.id); count(); }
          catch (e) { say('❌ ' + e.message); }
        };
        meta.appendChild(del);
      }
      b.appendChild(meta); row.appendChild(b); list.appendChild(row);
      shown.set(m.id, { node: row, from: m.from });
    }

    // --- Non lus ---
    const seen = () => { try { return localStorage.getItem(seenKey) || ''; } catch (e) { return ''; } };
    const active = () => o.isActive() && !document.hidden;
    function count() {
      let last = '', n = 0; const s = seen();
      shown.forEach((v, id) => { if (v.from !== o.me) { if (id > last) last = id; if (id > s) n++; } });
      if (active() && last) { try { localStorage.setItem(seenKey, last); } catch (e) {} n = 0; }
      if (o.onUnread) o.onUnread(n);
    }

    async function poll() {
      if (busy) return; busy = true;
      try {
        const r = await api('/api/chat' + (lastId ? '?after=' + lastId : ''));
        const wasBottom = nearBottom() || !shown.size;
        if (r.ids.length) {
          const set = new Set(r.ids), first = r.ids[0];
          shown.forEach((v, id) => { if (id >= first && !set.has(id)) { v.node.remove(); shown.delete(id); } });
        }
        let mineNew = false;
        for (const m of r.messages) {
          if (m.id > lastId) lastId = m.id;
          if (shown.has(m.id)) continue;
          await add(m); if (m.from === o.me) mineNew = true;
        }
        if (r.messages.length && (wasBottom || mineNew)) toBottom();
        if (!shown.size && !list.querySelector('.chat-empty')) list.appendChild(el('div', 'chat-empty', 'Aucun message pour le moment. Écris le premier 💗'));
        else if (shown.size) { const e = list.querySelector('.chat-empty'); if (e) e.remove(); }
        count();
        if (info.textContent.startsWith('📡')) say('');
      } catch (e) { say('📡 Connexion impossible pour le moment…', 0); }
      busy = false;
    }
    function schedule() {
      clearTimeout(timer); if (!started) return;
      const ms = active() ? 4000 : document.hidden ? 90000 : 45000;
      timer = setTimeout(async () => { await poll(); schedule(); }, ms);
    }
    document.addEventListener('visibilitychange', () => { if (started && !document.hidden) { poll().then(schedule); } });

    // --- Envoi ---
    async function post(obj, mid, parts) {
      const body = { enc: await encObj(obj) };
      if (mid) { body.mid = mid; body.parts = parts; }
      await api('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      await poll();
    }
    async function shrink(f) {
      if (f.type === 'image/gif') return f;
      try {
        const bmp = await createImageBitmap(f), sc = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
        const c = document.createElement('canvas'); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
        c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
        const out = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.82));
        return out && (out.size < f.size || sc < 1) ? out : f;
      } catch (e) { return f; }
    }
    async function sendBlob(blob, kind, extra) {
      if (blob.size > MAX_BYTES) { say('❌ Fichier trop lourd (' + mo(blob.size) + ') : maximum ' + mo(MAX_BYTES) + '. Raccourcis la vidéo.', 9000); return; }
      sending++; bSend.disabled = bFile.disabled = bMic.disabled = true;
      try {
        const sealed = await encBytes(new Uint8Array(await blob.arrayBuffer()));
        const parts = Math.ceil(sealed.length / PART), mid = hex(crypto.getRandomValues(new Uint8Array(16)));
        for (let i = 0; i < parts; i++) {
          say('⏫ Envoi… ' + (i + 1) + '/' + parts, 0);
          const r = await fetch('/api/chat-media?id=' + mid + '&part=' + i, { method: 'PUT', headers: H({ 'content-type': 'application/octet-stream' }), body: sealed.subarray(i * PART, (i + 1) * PART) });
          if (!r.ok) { let m = ''; try { m = (await r.json()).error; } catch (e) {} throw new Error(m || 'Erreur ' + r.status); }
        }
        await post({ k: kind, m: Object.assign({ mime: blob.type || 'application/octet-stream', size: blob.size }, extra || {}) }, mid, parts);
        say('');
      } catch (e) { say('❌ Envoi impossible : ' + e.message, 9000); }
      finally { sending--; bSend.disabled = bFile.disabled = bMic.disabled = false; }
    }
    async function sendText() {
      const t = txt.value.trim(); if (!t || sending) return;
      txt.value = ''; grow();
      try { await post({ k: 'text', x: t }); } catch (e) { txt.value = t; grow(); say('❌ Non envoyé : ' + e.message); }
    }

    bSend.onclick = sendText;
    const fine = matchMedia('(pointer:fine)').matches;
    txt.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && (fine || e.ctrlKey || e.metaKey)) { e.preventDefault(); sendText(); } });
    function grow() { txt.style.height = 'auto'; txt.style.height = Math.min(txt.scrollHeight, 120) + 'px'; }
    txt.addEventListener('input', grow);
    bFile.onclick = () => file.click();
    file.onchange = async () => {
      const f = file.files[0]; file.value = ''; if (!f) return;
      if (f.type.startsWith('image/')) await sendBlob(await shrink(f), 'image');
      else if (f.type.startsWith('video/')) await sendBlob(f, 'video');
      else say('❌ Choisis une photo ou une vidéo.');
    };

    // --- Vocaux ---
    let rec = null, recChunks = [], recT0 = 0, recTick = 0, recStream = null;
    function endRec() { clearInterval(recTick); if (recStream) recStream.getTracks().forEach(t => t.stop()); recStream = null; recBar.hidden = true; bar.hidden = false; }
    bMic.onclick = async () => {
      if (!navigator.mediaDevices || !window.MediaRecorder) { say('❌ Les vocaux ne sont pas pris en charge sur cet appareil ou ce navigateur.'); return; }
      try { recStream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
      catch (e) { say('❌ Micro refusé : autorise le micro dans ton navigateur.', 9000); return; }
      const mt = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'].find(t => MediaRecorder.isTypeSupported(t)) || '';
      rec = new MediaRecorder(recStream, mt ? { mimeType: mt } : {}); recChunks = [];
      rec.ondataavailable = e => { if (e.data && e.data.size) recChunks.push(e.data); };
      rec.start(); recT0 = Date.now(); bar.hidden = true; recBar.hidden = false; recT.textContent = '🔴 0:00';
      recTick = setInterval(() => { const s = (Date.now() - recT0) / 1000; recT.textContent = '🔴 ' + mmss(s); if (s >= MAX_REC) finishRec(true); }, 250);
    };
    function finishRec(send) {
      if (!rec) return; const r = rec; rec = null;
      const dur = (Date.now() - recT0) / 1000;
      r.onstop = async () => {
        endRec();
        if (!send) return;
        if (dur < 1) { say('Vocal trop court.'); return; }
        await sendBlob(new Blob(recChunks, { type: r.mimeType || 'audio/webm' }), 'audio', { dur: Math.round(dur) });
      };
      try { r.stop(); } catch (e) { endRec(); }
    }
    recX.onclick = () => finishRec(false);
    recOk.onclick = () => finishRec(true);

    return {
      start() { if (started) return; started = true; poll().then(schedule); },
      opened() { setTimeout(() => { poll().then(() => { toBottom(); schedule(); }); }, 0); toBottom(); },
      stop() { started = false; clearTimeout(timer); if (rec) finishRec(false); }
    };
  }

  ChatUI.newKey = newKey; ChatUI.token = token; ChatUI.tokenHash = tokenHash;
  window.ChatUI = ChatUI;
})();
