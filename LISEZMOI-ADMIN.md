# Partie administrateur : mise en place

## Ce que contient le projet

| Dossier / fichier | Rôle |
|---|---|
| `site/` | **Seul dossier mis en ligne** (le site + `admin.html`) |
| `netlify/functions/` | Les 3 fonctions : lire/publier le contenu, enregistrer l'activité, lire l'activité |
| `private/` | Tes fichiers à garder pour toi (`textes.js`, `chiffrer.js`, `messages.js`). Jamais publiés. |
| `netlify.toml`, `package.json` | Réglages Netlify |

## 1. Choisir le mot de passe administrateur

Sur Netlify : **Site configuration → Environment variables → Add a variable**
- Nom : `ADMIN_PASSWORD`
- Valeur : un mot de passe long, **différent** du code secret de Soraya.

## 2. Mettre en ligne (les fonctions ne marchent PAS avec le glisser-déposer)

**Option A : avec GitHub (recommandé)**
1. Crée un dépôt GitHub *privé* avec ce dossier (le `.gitignore` exclut déjà `private/`).
2. Sur Netlify : *Add new site → Import an existing project* → choisis le dépôt. Netlify lit `netlify.toml` tout seul.

**Option B : en ligne de commande** (dans ce dossier)
```
npm install
npx netlify-cli login
npx netlify-cli link        # choisis ton site existant
npx netlify-cli deploy --prod
```

Après avoir ajouté `ADMIN_PASSWORD`, **redéploie** une fois pour qu'elle soit prise en compte.

## 3. Utiliser l'administration

Ouvre `https://ton-site.netlify.app/admin.html`, entre :
- le **code secret** (celui de Soraya),
- le **mot de passe administrateur** (`ADMIN_PASSWORD`).

Modifie, puis clique sur **Publier les changements** (barre du bas). Soraya voit le nouveau contenu à sa prochaine ouverture du site.

## La discussion (chat) entre Soraya et toi

- **Côté Soraya :** un bouton 💬 en haut à droite, visible dès qu'elle a tapé le code. Une pastille rouge indique les messages non lus.
- **Côté toi :** onglet **💬 Discussion** dans `/admin.html`.
- **Ce qu'on peut envoyer :** texte, photos (réduites automatiquement), vidéos (**40 Mo maximum**), vocaux (3 minutes maximum). Chacun peut supprimer ses messages ; toi, tu peux tout supprimer.
- **Activation :** à ta première connexion à `/admin.html` après le déploiement, la discussion s'active toute seule (tu verras « Discussion activée »). Rien d'autre à faire.
- **Confidentialité :** tout est chiffré dans les navigateurs. Netlify ne voit ni les textes, ni les photos, ni les vocaux. Changer le code secret ne perd pas l'historique.
- **Limites :** pas de notification quand le site est fermé (les messages arrivent quand l'un de vous ouvre la page, en quelques secondes si elle est ouverte). Les vidéos très lourdes se chargent lentement en 4G.
- **Consommation Netlify :** la page ouverte interroge le serveur toutes les 4 secondes dans la discussion, et beaucoup moins souvent ailleurs. Les photos, vidéos et vocaux s'accumulent dans le stockage Netlify : supprime-les de temps en temps. Regarde la consommation de ton compte Netlify les premiers jours.

## Bon à savoir

- **Rien n'est lisible côté serveur** : les textes sont chiffrés dans ton navigateur avant l'envoi.
- **Changer le code secret** (onglet Réglages) rechiffre tout. Soraya devra taper le nouveau code ; sa mémoire locale de l'ancien code est effacée automatiquement.
- `site/contenu.enc.js` reste un contenu **de secours** (utilisé seulement si le serveur ne répond pas). Il se déchiffre avec le code **au moment où il a été généré**. Après un changement de code, remplace-le par celui téléchargé depuis Réglages → « Télécharger contenu.enc.js », ou supprime-le.
- Fais de temps en temps **Réglages → Sauvegarde (.json)** : c'est tes textes en clair, à garder pour toi.
- `chiffrer.js` et `textes.js` ne sont plus nécessaires au quotidien. Ils restent utilisables si tu veux repartir d'un fichier.
- L'activité enregistrée : visite, message ouvert, « j'adore / pas trop », coups de cœur, bonne nuit lue, lettre ouverte, bisou WhatsApp. Aucun texte n'est enregistré, seulement le type et le numéro. Bouton « Effacer l'historique » dans l'onglet Activité.
