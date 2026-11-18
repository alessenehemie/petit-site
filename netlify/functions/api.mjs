import { getStore } from '@netlify/blobs';
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export default async (req) => {
  const a = new URL(req.url).searchParams.get('a'), s = getStore('soraya');
  const etat = async () => (await s.get('etat', { type: 'json' })) || {};

  // Public : le contenu chiffré (ou « bloqué »)
  if (req.method === 'GET' && a === 'contenu.js') {
    const h = { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' };
    if ((await etat()).blocked) return new Response('const CONTENU_CHIFFRE={bloque:true};', { headers: h });
    const c = await s.get('contenu', { type: 'json' });
    if (!c) return new Response(null, { status: 302, headers: { location: '/contenu.enc.js', 'cache-control': 'no-store' } });
    return new Response('const CONTENU_CHIFFRE = ' + JSON.stringify(c) + ';', { headers: h });
  }

  // Public : journal d'activité
  if (req.method === 'POST' && a === 'event') {
    const { e } = await req.json().catch(() => ({}));
    if (typeof e !== 'string' || !e || e.length > 60) return json({ ok: false }, 400);
    const log = (await s.get('log', { type: 'json' })) || [];
    log.push({ t: Date.now(), e });
    await s.setJSON('log', log.slice(-400));
    return json({ ok: true });
  }

  // Admin : protégé par ADMIN_PASSWORD
  if (req.method === 'POST' && a === 'admin') {
    const pw = Netlify.env.get('ADMIN_PASSWORD');
    if (!pw) return json({ error: "ADMIN_PASSWORD n'est pas configuré sur Netlify." }, 500);
    if (req.headers.get('x-admin-password') !== pw) {
      await new Promise(r => setTimeout(r, 1500));
      return json({ error: 'Mot de passe administrateur incorrect.' }, 401);
    }
    const b = await req.json().catch(() => ({}));
    if (b.action === 'etat') return json({ blocked: !!(await etat()).blocked, log: (await s.get('log', { type: 'json' })) || [], blob: await s.get('contenu', { type: 'json' }) });
    if (b.action === 'bloquer') { const st = await etat(); st.blocked = !!b.value; await s.setJSON('etat', st); return json({ ok: true }); }
    if (b.action === 'effacer') { await s.setJSON('log', []); return json({ ok: true }); }
    if (b.action === 'publier') {
      const c = b.blob || {};
      if (c.v !== 1 || !Number.isInteger(c.iter) || !['salt', 'iv', 'data'].every(k => typeof c[k] === 'string')) return json({ error: 'Contenu invalide.' }, 400);
      await s.setJSON('contenu', { v: 1, iter: c.iter, salt: c.salt, iv: c.iv, data: c.data });
      return json({ ok: true });
    }
    return json({ error: 'Action inconnue.' }, 400);
  }
  return json({ error: 'Introuvable' }, 404);
};
