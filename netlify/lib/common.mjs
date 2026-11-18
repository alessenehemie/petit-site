// Outils communs aux fonctions Netlify.
import { getStore } from '@netlify/blobs';
import { createHash, timingSafeEqual } from 'node:crypto';

// Espace de stockage Netlify Blobs : le contenu chiffré et le journal d'activité.
export const store = () => getStore({ name: 'soraya', consistency: 'strong' });

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });

const sha = s => createHash('sha256').update(String(s)).digest();

const sha256hex = s => createHash('sha256').update(String(s)).digest('hex');
export { sha256hex };

// Qui parle au chat ? L'administrateur (mot de passe) ou Soraya (jeton dérivé de la clé de chat,
// qui n'existe que dans le contenu chiffré : il faut donc le code secret pour l'obtenir).
// Retourne {role:'admin'|'soraya'} ou {refus: Response}.
export async function roleChat(req) {
  if (req.headers.get('x-admin-password')) {
    const refus = await verifierAdmin(req);
    return refus ? { refus } : { role: 'admin' };
  }
  const tok = req.headers.get('x-chat-token');
  if (tok && tok.length <= 200) {
    const a = await store().get('chat-auth', { type: 'json' });
    if (a && typeof a.hash === 'string' && a.hash.length === 64) {
      const h = sha256hex(tok);
      if (timingSafeEqual(Buffer.from(h), Buffer.from(a.hash))) return { role: 'soraya' };
    }
  }
  await new Promise(r => setTimeout(r, 500));
  return { refus: json({ error: 'Accès refusé.' }, 401) };
}

// Vérifie le mot de passe administrateur (variable d'environnement ADMIN_PASSWORD sur Netlify).
// Retourne null si tout est bon, sinon la Response d'erreur à renvoyer.
export async function verifierAdmin(req) {
  const attendu = process.env.ADMIN_PASSWORD;
  if (!attendu) return json({ error: "ADMIN_PASSWORD n'est pas configuré sur Netlify." }, 503);
  const donne = req.headers.get('x-admin-password') || '';
  if (timingSafeEqual(sha(donne), sha(attendu))) return null;
  await new Promise(r => setTimeout(r, 1000)); // ralentit les essais au hasard
  return json({ error: 'Mot de passe administrateur incorrect.' }, 401);
}
