// Abonnement de Soraya aux notifications.
//   GET  /api/push   clé publique (Soraya ou admin)
//   POST /api/push   enregistre l'appareil de Soraya
import { store, json, roleChat } from '../lib/common.mjs';
import { cles } from '../lib/push.mjs';

export default async (req) => {
  const { role, refus } = await roleChat(req);
  if (refus) return refus;
  if (req.method === 'GET') return json({ key: (await cles(new URL(req.url).origin)).pub });
  if (req.method === 'POST') {
    if (role !== 'soraya') return json({ error: 'Réservé à Soraya.' }, 403);
    let sub; try { sub = JSON.parse(await req.text()); } catch { return json({ error: 'Abonnement invalide.' }, 400); }
    const k = sub && sub.keys;
    if (!sub || typeof sub.endpoint !== 'string' || !sub.endpoint.startsWith('https://') || sub.endpoint.length > 1000 ||
        !k || typeof k.p256dh !== 'string' || typeof k.auth !== 'string' || k.p256dh.length > 200 || k.auth.length > 100)
      return json({ error: 'Abonnement invalide.' }, 400);
    const s = store();
    const ab = ((await s.get('push-soraya', { type: 'json' })) || []).filter(x => x.endpoint !== sub.endpoint);
    ab.push({ endpoint: sub.endpoint, keys: { p256dh: k.p256dh, auth: k.auth } });
    await s.setJSON('push-soraya', ab.slice(-5));
    return json({ ok: true });
  }
  return json({ error: 'Méthode non autorisée.' }, 405);
};
export const config = { path: '/api/push' };
