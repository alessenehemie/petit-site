// Notifications push (Soraya et Nissi). Les clés VAPID sont créées automatiquement au premier usage.
import webpush from 'web-push';
import { store } from './common.mjs';

export async function cles(origin) {
  const s = store();
  let v = await s.get('push-vapid', { type: 'json' });
  if (!v) { const k = webpush.generateVAPIDKeys(); v = { pub: k.publicKey, priv: k.privateKey, sujet: origin }; await s.setJSON('push-vapid', v); }
  return v;
}

async function envoyer(cle, payload) {
  const s = store();
  const v = await s.get('push-vapid', { type: 'json' });
  const ab = (await s.get(cle, { type: 'json' })) || [];
  if (!v || !ab.length) return 0;
  webpush.setVapidDetails(v.sujet, v.pub, v.priv);
  const gardes = []; let n = 0;
  await Promise.all(ab.map(async sub => {
    try { await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 86400 }); gardes.push(sub); n++; }
    catch (e) { if (e.statusCode !== 404 && e.statusCode !== 410) gardes.push(sub); }
  }));
  if (gardes.length !== ab.length) await s.setJSON(cle, gardes);
  return n;
}
export const notifierSoraya = payload => envoyer('push-soraya', payload);
export const notifierAdmin = payload => envoyer('push-admin', payload);
