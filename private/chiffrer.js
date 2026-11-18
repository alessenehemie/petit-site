#!/usr/bin/env node
// =====================================================================
//  chiffrer.js — transforme textes.js en contenu.enc.js (version chiffrée)
//  À garder pour toi, avec textes.js. Ne pas mettre en ligne.
// =====================================================================
// Utilisation :   node chiffrer.js
//   - le code secret est demandé à chaque fois (il n'est écrit nulle part) ;
//   - il doit être EXACTEMENT celui que Soraya tape sur le site ;
//   - le fichier contenu.enc.js est créé à côté de ce script : copie-le dans le dossier du site.
// Technique : le code sert de clé (PBKDF2-SHA256, 200 000 tours) pour chiffrer en AES-256-GCM.
'use strict';
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { webcrypto: crypto } = require('crypto');

const ITER = 200000;
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = u8 => Buffer.from(u8).toString('base64');

async function cle(code, salt, usage){
  const base = await crypto.subtle.importKey('raw', enc.encode(code), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, usage);
}

function demander(question){
  return new Promise(res => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, r => { rl.close(); res(r); });
  });
}

function verifier(t){
  for (const k of ['messages', 'nuit', 'lettres'])
    if (!Array.isArray(t[k]) || !t[k].length) throw new Error('« ' + k + ' » doit être une liste non vide dans textes.js');
  t.messages.concat(t.nuit).forEach(m => {
    if (typeof m !== 'string' || !m.trim()) throw new Error('Un message est vide ou invalide dans textes.js');
  });
  t.lettres.forEach(l => {
    if (!l || typeof l.t !== 'string' || typeof l.m !== 'string')
      throw new Error('Chaque lettre « Ouvre quand… » doit ressembler à {t:"titre", m:"texte"}');
  });
  (t.moments || []).forEach(m => {
    if (!m || typeof m.date !== 'string' || typeof m.text !== 'string')
      throw new Error("Chaque moment doit ressembler à {date:'2026-03-14', text:'...'}");
  });
}

(async () => {
  const textes = require('./textes.js');
  verifier(textes);

  // Même normalisation que sur le site : espaces autour retirés, minuscules.
  const code = (await demander('Code secret (celui que Soraya doit taper) : ')).trim().toLowerCase();
  if (!code) throw new Error('Le code ne peut pas être vide.');
  if (code.length < 12) console.log('⚠️  Ce code est court : plus il est long et imprévisible, mieux les messages sont protégés.');

  const payload = JSON.stringify({
    messages: textes.messages, nuit: textes.nuit, lettres: textes.lettres,
    moments: textes.moments || [], whatsapp: textes.whatsapp || ''
  });

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cle(code, salt, ['encrypt']), enc.encode(payload)));

  // Contrôle : on redéchiffre pour être sûr que le fichier est bon.
  const retour = dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await cle(code, salt, ['decrypt']), data));
  if (retour !== payload) throw new Error('Vérification échouée : le contenu rechiffré ne correspond pas.');

  const sortie = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, 'contenu.enc.js');
  fs.writeFileSync(sortie,
    '// Fichier généré par chiffrer.js : contenu chiffré (AES-GCM). Ne pas modifier à la main.\n' +
    'const CONTENU_CHIFFRE = ' + JSON.stringify({ v: 1, iter: ITER, salt: b64(salt), iv: b64(iv), data: b64(data) }) + ';\n');

  console.log('✅ ' + textes.messages.length + ' messages, ' + textes.nuit.length + ' messages de nuit, ' +
    textes.lettres.length + ' lettres chiffrés → ' + sortie);
  console.log('   Copie ce fichier dans le dossier du site.');
})().catch(e => { console.error('❌ ' + e.message); process.exit(1); });