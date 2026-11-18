// GET    /api/activity : les 200 derniers événements d'activité (administrateur).
// DELETE /api/activity : efface tout l'historique (administrateur).
import { store, json, verifierAdmin } from '../lib/common.mjs';

export default async (req) => {
  const refus = await verifierAdmin(req);
  if (refus) return refus;
  if (req.method !== 'GET' && req.method !== 'DELETE') return json({ error: 'Méthode non autorisée.' }, 405);

  const s = store();
  const { blobs } = await s.list({ prefix: 'ev/' });
  const keys = blobs.map(b => b.key).sort().reverse();   // plus récent d'abord

  if (req.method === 'DELETE') {
    await Promise.all(keys.map(k => s.delete(k)));
    return json({ ok: true, supprimes: keys.length });
  }

  const events = (await Promise.all(keys.slice(0, 200).map(k => s.get(k, { type: 'json' })))).filter(Boolean);
  return json({ events, total: keys.length });
};

export const config = { path: '/api/activity' };
