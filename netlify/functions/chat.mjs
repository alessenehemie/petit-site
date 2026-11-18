// Discussion entre Soraya et Nissi. Tout le contenu (texte, légendes, types de médias) est chiffré par les navigateurs :
// le serveur ne voit que des blocs illisibles, l'auteur (admin / soraya) et l'heure.
//   GET    /api/chat?after=<id>   nouveaux messages (sans "after" : les 100 derniers) + liste des identifiants récents
//   POST   /api/chat              envoie un message : {enc:{iv,data}, mid?, parts?}
//   DELETE /api/chat?id=<id>      supprime un message (Soraya : les siens ; admin : tous)
import { store, json, roleChat } from '../lib/common.mjs';
import { notifierSoraya, notifierAdmin } from '../lib/push.mjs';

const B64 = /^[A-Za-z0-9+/]*={0,2}$/;
const ID = /^[0-9]{15}-[a-z0-9]{1,8}$/;
const MID = /^[a-f0-9]{32}$/;
const MAX_PARTS = 12;

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
    const messages = (await Promise.all(pick.map(async id => {
      const m = await s.get('chat/' + id, { type: 'json' });
      return m ? { id, ...m } : null;
    }))).filter(Boolean);
    return json({ messages, ids: keys.slice(-300), me: role });
  }

  if (req.method === 'POST') {
    let b;
    try {
      const txt = await req.text();
      if (txt.length > 30000) throw new Error('trop long');
      b = JSON.parse(txt);
    } catch { return json({ error: 'Message invalide.' }, 400); }
    const e = b && b.enc;
    if (!e || typeof e.iv !== 'string' || typeof e.data !== 'string' || !B64.test(e.iv) || !B64.test(e.data) || !e.data)
      return json({ error: 'Message invalide.' }, 400);
    const rec = { t: Date.now(), from: role, enc: { iv: e.iv, data: e.data } };
    if (b.mid !== undefined) {
      if (typeof b.mid !== 'string' || !MID.test(b.mid) || !Number.isInteger(b.parts) || b.parts < 1 || b.parts > MAX_PARTS)
        return json({ error: 'Média invalide.' }, 400);
      rec.mid = b.mid; rec.parts = b.parts;
    }
    const id = String(rec.t).padStart(15, '0') + '-' + Math.random().toString(36).slice(2, 7);
    await s.setJSON('chat/' + id, rec);
    // Message de Nissi : on prévient Soraya (texte volontairement neutre, le contenu reste chiffré).
    if (role === 'soraya') {
      try { await Promise.race([notifierAdmin({ title: 'Soraya 💗', body: 'Nouveau message de Soraya 💬', url: '/admin.html' }), new Promise(r => setTimeout(r, 4000))]); } catch (_) {}
    }
    if (role === 'admin') {
      try { await Promise.race([notifierSoraya({ title: 'Nissi 💗', body: 'Tu as un nouveau message 💬', url: '/' }), new Promise(r => setTimeout(r, 4000))]); } catch (_) {}
    }
    return json({ ok: true, id, t: rec.t });
  }

  if (req.method === 'DELETE') {
    const id = url.searchParams.get('id') || '';
    if (!ID.test(id)) return json({ error: 'Identifiant invalide.' }, 400);
    const m = await s.get('chat/' + id, { type: 'json' });
    if (!m) return json({ ok: true });
    if (role !== 'admin' && m.from !== role) return json({ error: 'Tu ne peux supprimer que tes messages.' }, 403);
    if (m.mid) await Promise.all(Array.from({ length: m.parts || 0 }, (_, i) => s.delete('media/' + m.mid + '/' + i)));
    await s.delete('chat/' + id);
    return json({ ok: true });
  }

  return json({ error: 'Méthode non autorisée.' }, 405);
};

export const config = { path: '/api/chat' };
