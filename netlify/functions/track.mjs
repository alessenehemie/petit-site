// POST /api/track : enregistre un petit événement d'activité (public, sans aucun texte, juste un type et un numéro).
import { store, json } from '../lib/common.mjs';

const TYPES = new Set(['visit', 'open', 'like', 'fav', 'night', 'letter', 'kiss']);

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405);

  let b;
  try {
    const txt = await req.text();
    if (txt.length > 400) throw new Error('trop long');
    b = JSON.parse(txt);
  } catch { return json({ error: 'Requête invalide.' }, 400); }

  if (!b || !TYPES.has(b.type)) return json({ error: 'Type inconnu.' }, 400);

  const e = { t: Date.now(), type: b.type };           // l'heure est celle du serveur
  if (Number.isInteger(b.i) && b.i >= 0 && b.i < 10000) e.i = b.i;
  if (typeof b.on === 'boolean') e.on = b.on;

  const key = 'ev/' + String(e.t).padStart(15, '0') + '-' + Math.random().toString(36).slice(2, 7);
  await store().setJSON(key, e);
  return json({ ok: true });
};

export const config = { path: '/api/track' };
