// GET  /api/content : renvoie le contenu CHIFFRÉ publié (public, illisible sans le code secret).
// PUT  /api/content : publie un nouveau contenu chiffré (réservé à l'administrateur).
// Le serveur ne voit jamais les textes en clair ni le code secret : tout est chiffré dans le navigateur.
import { store, json, verifierAdmin } from '../lib/common.mjs';

const B64 = /^[A-Za-z0-9+/]+={0,2}$/;

export default async (req) => {
  const s = store();

  if (req.method === 'GET') {
    const c = await s.get('content', { type: 'json' });
    return c ? json(c) : json({ error: 'Aucun contenu publié.' }, 404);
  }

  if (req.method === 'PUT') {
    const refus = await verifierAdmin(req);
    if (refus) return refus;
    let c;
    try { c = await req.json(); } catch { return json({ error: 'JSON invalide.' }, 400); }
    const ok = c && c.v === 1
      && Number.isInteger(c.iter) && c.iter >= 100000 && c.iter <= 2000000
      && ['salt', 'iv', 'data'].every(k => typeof c[k] === 'string' && c[k].length < 4000000 && B64.test(c[k]));
    if (!ok) return json({ error: 'Contenu invalide.' }, 400);
    await s.setJSON('content', { v: 1, iter: c.iter, salt: c.salt, iv: c.iv, data: c.data });
    // Empreinte du jeton de chat de Soraya (le jeton lui-même n'est jamais envoyé ici).
    if (c.chatTokenHash !== undefined) {
      if (typeof c.chatTokenHash !== 'string' || !/^[0-9a-f]{64}$/.test(c.chatTokenHash)) return json({ error: 'Empreinte de chat invalide.' }, 400);
      await s.setJSON('chat-auth', { hash: c.chatTokenHash });
    }
    return json({ ok: true });
  }

  return json({ error: 'Méthode non autorisée.' }, 405);
};

export const config = { path: '/api/content' };
