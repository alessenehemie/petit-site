// Photos, vidéos et vocaux du chat : déjà chiffrés par le navigateur, envoyés en morceaux de 4 Mo maximum
// (les fonctions Netlify refusent les envois de plus de ~6 Mo).
//   PUT /api/chat-media?id=<32 hex>&part=<n>   dépose un morceau (corps binaire)
//   GET /api/chat-media?id=<32 hex>&part=<n>   relit un morceau
import { store, json, roleChat } from '../lib/common.mjs';

const MID = /^[a-f0-9]{32}$/;
const MAX_PARTS = 12;
const MAX_PART_BYTES = 4.5 * 1024 * 1024;

export default async (req) => {
  const { refus } = await roleChat(req);
  if (refus) return refus;

  const url = new URL(req.url);
  const id = url.searchParams.get('id') || '';
  const part = Number(url.searchParams.get('part'));
  if (!MID.test(id) || !Number.isInteger(part) || part < 0 || part >= MAX_PARTS) return json({ error: 'Paramètres invalides.' }, 400);
  const key = 'media/' + id + '/' + part;
  const s = store();

  if (req.method === 'PUT') {
    const buf = await req.arrayBuffer();
    if (!buf.byteLength) return json({ error: 'Morceau vide.' }, 400);
    if (buf.byteLength > MAX_PART_BYTES) return json({ error: 'Morceau trop gros.' }, 413);
    await s.set(key, buf);
    return json({ ok: true });
  }

  if (req.method === 'GET') {
    const buf = await s.get(key, { type: 'arrayBuffer' });
    if (!buf) return json({ error: 'Introuvable.' }, 404);
    return new Response(buf, {
      headers: { 'content-type': 'application/octet-stream', 'cache-control': 'private, max-age=86400' }
    });
  }

  return json({ error: 'Méthode non autorisée.' }, 405);
};

export const config = { path: '/api/chat-media' };
