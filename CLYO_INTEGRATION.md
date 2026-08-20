# Connecteur CLYO natif

Fait apparaître automatiquement les commandes Wegemo dans la caisse CLYO,
via le protocole officiel "interfacer un site de vente en ligne" documenté
par CLYO (pas HubRise — ce connecteur lui est indépendant et ne le
remplace pas dans le code, `migration_pos_hubrise.sql` reste en place).

C'est la caisse CLYO qui vient chercher les commandes chez Wegemo (pull),
à son propre rythme de sondage — Wegemo ne pousse rien.

## Pourquoi un second déploiement (Vercel)

La caisse CLYO fait un `GET` sur `<URL configurée>/clyo/prodNoClyoKey.php`
littéralement — seul le domaine racine est configurable côté caisse, pas le
chemin. GitHub Pages (qui sert le site client/QR actuel) est 100% statique
et ne peut pas router ce chemin vers du code serveur. Les 6 endpoints
(`api/clyo-*.js`) sont donc déployés sur un projet Vercel séparé, qui ne
sert QUE le pont CLYO — le site client continue de vivre sur GitHub Pages,
zéro changement pour tes clients qui scannent un QR code.

## 1. Créer le projet Vercel

1. Sur [vercel.com](https://vercel.com), "Add New Project" → importe ce
   dépôt GitHub (`agencywgm-arch/wegemo`, branche
   `claude/ticket-clyo-layout` ou celle où ce connecteur a été mergé).
2. Dans Project Settings → Environment Variables, ajoute (Production) :
   - `SUPABASE_URL` — l'URL de ton projet Supabase (`https://xxxx.supabase.co`)
   - `SUPABASE_SERVICE_ROLE_KEY` — la clé **service_role** (Supabase →
     Project Settings → API). **Jamais** de préfixe `VITE_` sur cette clé :
     elle ne doit jamais atterrir dans le bundle JS envoyé au navigateur.
     Elle n'est lue que par les fonctions serverless dans `api/`.
3. Déploie. Note l'URL obtenue (ex : `https://wegemo-clyo.vercel.app`).

## 2. Relier le pont au dashboard Wegemo

Dans les secrets GitHub Actions du dépôt (Settings → Secrets → Actions),
ajoute `VITE_CLYO_BRIDGE_URL` = l'URL Vercel notée ci-dessus (sans `/` final).
Redéploie (`workflow_dispatch` ou un push) pour que le dashboard GitHub
Pages puisse afficher l'URL exacte à coller dans la caisse.

## 3. Activer côté Wegemo

Dashboard restaurant → Réglages → « 🔌 Caisse CLYO — connecteur direct » →
**Activer le connecteur CLYO**. Note l'URL affichée
(`https://<projet>.vercel.app/r/<token>`) et le mot de passe (bouton
Afficher).

## 4. Configurer côté caisse CLYO

Dans le logiciel de caisse : `Paramètre > Paramètre > Périphérique` →
onglet « Site Web e-Commerce » :
- URL du site : colle l'URL notée à l'étape 3
- Mot de passe de récupération : colle le mot de passe affiché
- Reglement C.B internet : choisis le libellé (ex. `CARTE BLEUE`) puis
  reporte-le **exactement** dans le champ correspondant du dashboard Wegemo
- Article frais de port / Article remise : pas utilisés par Wegemo
  (restaurant sur place, pas de livraison) — laisse vide ou choisis
  n'importe quel article, ça n'a pas d'effet côté Wegemo

## 5. Lier les articles

`Paramètre > Article > Gestion des claviers > Lien des articles e-commerce` :
« Affichage produits NON-liés » liste les articles du menu Wegemo sans
correspondance CLYO. Sélectionne chaque article, choisis l'article caisse
correspondant, clique « Lier ». Répète pour tout le menu.

Tant qu'un article d'une commande n'est pas lié, **cette commande précise**
reste bloquée côté Wegemo (visible dans le dashboard, statut « Bloquée »)
et repart automatiquement dès que le lien est fait — les autres commandes
ne sont pas affectées.

## 6. Tester

Passe une commande de test (Vente ou QR code). Elle apparaît dans le
dashboard Wegemo avec le statut « En attente » puis « Transmise » dès que
la caisse la récupère (selon son intervalle de sondage), puis « Acceptée
en caisse » quand CLYO confirme l'avoir traitée (`updateOrder.php`).

## Limites connues du protocole (pas un bug Wegemo)

- **Annulation après transmission** : le protocole CLYO ne documente aucun
  appel "annuler" côté site. Annuler une commande déjà transmise dans
  Wegemo (bouton « Annuler ») l'arrête côté Wegemo mais **ne supprime pas**
  le ticket déjà remonté en caisse — il faut aussi le supprimer
  manuellement dans CLYO. Le dashboard le signale explicitement dans ce cas.
- **`nb_couvert`** : Wegemo ne trace pas encore le nombre de couverts par
  commande en base ; le connecteur envoie `1` par défaut quand une table
  est associée. Se corrige tout seul dès que cette colonne existera.
- **Prix dans `keyAndPrice`** : reflète le prix *actuel* de l'article
  (`menu_items.price`), pas un prix figé au moment de la commande — les
  commandes n'enregistrent pas de prix ligne par ligne dans le schéma
  actuel. Sans effet en pratique sauf changement de prix entre la commande
  et le passage en caisse.
