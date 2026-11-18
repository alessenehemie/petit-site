// Discussion entre Soraya et Nissi. Tout le contenu (texte, légendes, types de médias) est chiffré par les navigateurs :
// le serveur ne voit que des blocs illisibles, l'auteur (admin / soraya) et l'heure.
//   GET    /api/chat?after=<id>&maj=<ts>   nouveaux messages + messages modifiés/supprimés depuis <ts> + lu + messages masqués + typing
//   POST   /api/chat                       envoie un message : {enc:{iv,data}, mid?, parts?}
//   PUT    /api/chat?op=edit&id=<id>       modifie un de SES messages texte : {enc}
//   PUT    /api/chat?op=read&id=<id>       « j'ai lu jusqu'à ce message »
//   PUT    /api/chat?op=hide&id=<id>       supprime un message « pour moi » seulement
//   PUT    /api/chat?op=react&id=<id>      ajoute/retire une réaction emoji : {emoji}
//   PUT    /api/chat?op=typing             indique que l'utilisateur est en train d'écrire
//   DELETE /api/chat?id=<id>               supprime « pour tous » (Soraya : les siens ; admin : tous) → reste un « message supprimé »
import { store, json, roleChat } from '../lib/common.mjs';
import { notifierSoraya, notifierAdmin } from '../lib/push.mjs';

const B64 = /^[A-Za-z0-9+/]*={0,2}$/;
const ID = /^[0-9]{15}-[a-z0-9]{1,8}$/;
const MID = /^[a-f0-9]{32}$/;
const MAX_PARTS = 12;
const ALLOWED_EMOJIS = ['❤️', '👍', '😂', '😮', '😢', '🙏'];
const validEnc = e => e && typeof e.iv === 'string' && typeof e.data === 'string' && B64.test(e.iv) && B64.test(e.data) && e.data;

async function lireCorps(req) {
  const txt = await req.text();
  if (txt.length > 30000) throw new Error('trop long');
  return JSON.parse(txt);
}
// Journal des modifications récentes (pour que l'autre navigateur les voie) + marqueurs « lu » + typing.
const meta = async s => (await s.get('chat-meta', { type: 'json' })) || {};
async function noter(s, id, u) {
  const m = await meta(s); m.maj = (Array.isArray(m.maj) ? m.maj : []).concat([{ id, u }]).slice(-60);
  await s.setJSON('chat-meta', m);
}

export default async (req) => {
  const { role, refus } = await roleChat(req);
  if (refus) return refus;
  const s = store();
  const url = new URL(req.url);

  if (req.method === 'GET') {
    const keys = (await s.list({ prefix: 'chat/' })).blobs.map(b => b.key.slice(5)).sort();
    const after = url.searchParams.get('after');
    let pick;
    if (after && ID.test(after)) pick = keys.filter(k => k > after).slice(0, 100);
    else pick = keys.slice(-100);
    const lire = async id => { const m = await s.get('chat/' + id, { type: 'json' }); return m ? { id, ...m } : null; };
    const messages = (await Promise.all(pick.map(lire))).filter(Boolean);
    const mt = await meta(s), journal = Array.isArray(mt.maj) ? mt.maj : [];
    const sm = url.searchParams.get('maj'), since = sm === null ? -1 : (Number(sm) || 0);
    const maj = journal.reduce((a, x) => Math.max(a, x.u), 0);
    let updates = [];
    if (since >= 0) updates = (await Promise.all([...new Set(journal.filter(x => x.u > since).map(x => x.id))].map(lire))).filter(Boolean);
    const cache = (await s.get('chat-cache-' + role, { type: 'json' })) || [];
    const other = role === 'admin' ? 'soraya' : 'admin';
    const typingAt = (mt.typing && mt.typing[other]) || 0;
    const isTyping = (Date.now() - typingAt) < 6000;
    return json({ messages, ids: keys.slice(-300), me: role, lu: mt.lu || {}, maj, updates, cache, isTyping });
  }

  if (req.method === 'POST') {
    let b;
    try { b = await lireCorps(req); } catch { return json({ error: 'Message invalide.' }, 400); }
    const e = b && b.enc;
    if (!validEnc(e)) return json({ error: 'Message invalide.' }, 400);
    const rec = { t: Date.now(), from: role, enc: { iv: e.iv, data: e.data } };
    if (b.mid !== undefined) {
      if (typeof b.mid !== 'string' || !MID.test(b.mid) || !Number.isInteger(b.parts) || b.parts < 1 || b.parts > MAX_PARTS)
        return json({ error: 'Média invalide.' }, 400);
      rec.mid = b.mid; rec.parts = b.parts;
    }
    const id = String(rec.t).padStart(15, '0') + '-' + Math.random().toString(36).slice(2, 7);
    await s.setJSON('chat/' + id, rec);
    // Réinitialiser l'état "en train d'écrire" à l'envoi
    const mt = await meta(s);
    if (mt.typing && mt.typing[role]) { mt.typing[role] = 0; await s.setJSON('chat-meta', mt); }
    // Notification : message de Nissi → Soraya, message de Soraya → Nissi (texte neutre, le contenu reste chiffré).
    const prevenir = role === 'admin'
      ? notifierSoraya({ title: 'Nissi 💗', body: 'Tu as un nouveau message 💬', url: '/' })
      : notifierAdmin({ title: 'Soraya 💗', body: 'Nouveau message de Soraya 💬', url: '/admin.html' });
    try { await Promise.race([prevenir, new Promise(r => setTimeout(r, 4000))]); } catch (_) {}
    return json({ ok: true, id, t: rec.t });
  }

  if (req.method === 'PUT') {
    const op = url.searchParams.get('op'), id = url.searchParams.get('id') || '';
    if (op === 'typing') {
      const mt = await meta(s);
      mt.typing = mt.typing || {};
      mt.typing[role] = Date.now();
      await s.setJSON('chat-meta', mt);
      return json({ ok: true });
    }
    if (!ID.test(id)) return json({ error: 'Identifiant invalide.' }, 400);
    if (op === 'read') {
      const mt = await meta(s); mt.lu = mt.lu || {};
      if (!(mt.lu[role] >= id)) { mt.lu[role] = id; await s.setJSON('chat-meta', mt); }
      return json({ ok: true });
    }
    if (op === 'hide') {
      const c = (await s.get('chat-cache-' + role, { type: 'json' })) || [];
      if (!c.includes(id)) { c.push(id); await s.setJSON('chat-cache-' + role, c.slice(-500)); }
      return json({ ok: true });
    }
    if (op === 'react') {
      let b;
      try { b = await lireCorps(req); } catch { return json({ error: 'Requête invalide.' }, 400); }
      const emoji = b && b.emoji;
      if (emoji !== null && !ALLOWED_EMOJIS.includes(emoji)) return json({ error: 'Emoji non autorisé.' }, 400);
      const m = await s.get('chat/' + id, { type: 'json' });
      if (!m) return json({ error: 'Message introuvable.' }, 404);
      if (m.deleted) return json({ error: 'Message supprimé.' }, 400);
      m.reactions = m.reactions || {};
      if (emoji === null || m.reactions[role] === emoji) {
        delete m.reactions[role];
      } else {
        m.reactions[role] = emoji;
      }
      m.u = Date.now();
      await s.setJSON('chat/' + id, m);
      await noter(s, id, m.u);
      return json({ ok: true, reactions: m.reactions });
    }
    if (op === 'edit') {
      let b;
      try { b = await lireCorps(req); } catch { return json({ error: 'Message invalide.' }, 400); }
      if (!validEnc(b && b.enc)) return json({ error: 'Message invalide.' }, 400);
      const m = await s.get('chat/' + id, { type: 'json' });
      if (!m) return json({ error: 'Message introuvable.' }, 404);
      if (m.deleted) return json({ error: 'Ce message a été supprimé.' }, 400);
      if (m.from !== role) return json({ error: 'Tu ne peux modifier que tes messages.' }, 403);
      if (m.mid) return json({ error: 'Seuls les textes peuvent être modifiés.' }, 400);
      m.enc = { iv: b.enc.iv, data: b.enc.data }; m.edited = true; m.u = Date.now();
      await s.setJSON('chat/' + id, m); await noter(s, id, m.u);
      return json({ ok: true });
    }
    return json({ error: 'Opération inconnue.' }, 400);
  }

  if (req.method === 'DELETE') {
    const id = url.searchParams.get('id') || '';
    if (!ID.test(id)) return json({ error: 'Identifiant invalide.' }, 400);
    const m = await s.get('chat/' + id, { type: 'json' });
    if (!m || m.deleted) return json({ ok: true });
    if (role !== 'admin' && m.from !== role) return json({ error: 'Tu ne peux supprimer que tes messages.' }, 403);
    if (m.mid) await Promise.all(Array.from({ length: m.parts || 0 }, (_, i) => s.delete('media/' + m.mid + '/' + i)));
    const u = Date.now();
    await s.setJSON('chat/' + id, { t: m.t, from: m.from, deleted: true, u });
    await noter(s, id, u);
    return json({ ok: true });
  }

  return json({ error: 'Méthode non autorisée.' }, 405);
};

export const config = { path: '/api/chat' };
