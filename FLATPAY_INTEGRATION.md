# Intégration paiement en ligne via Flatpay

Ajoute Flatpay comme **second provider de paiement en ligne**, à côté de
Stripe (inchangé, jamais touché). Un restaurant utilise l'un ou l'autre —
réglable dans Dashboard → Paramètres → « Paiement en ligne ».

```
Client scanne le QR code WGM
  → menu WGM → panier → "Payer en ligne"
  → flatpay-create-payment calcule le montant SERVEUR (price_cart_secure)
    et ouvre une tentative de paiement (payment_attempts, PAS de commande WGM)
  → redirection vers la page de paiement hébergée Flatpay (carte / Apple Pay)
  → retour sur /r/{slug}/t/{table}/payment/{success|cancel|pending}
  → flatpay-payment-status revérifie le VRAI statut auprès de Flatpay
  → si payé : create_order_secure crée ENFIN la commande WGM (numéro fiscal
    inclus) — jamais avant
  → webhook Flatpay (si configuré) confirme indépendamment, idempotent
```

## 1. Ce qui a été trouvé dans l'architecture actuelle

- **Frontend** : une seule SPA React (`src/App.jsx`, ~6900 lignes), déployée
  sur GitHub Pages (`.github/workflows/deploy.yml`, build Vite). Routing
  "maison" par lecture de `window.location.pathname` dans `AppInner`, pas de
  react-router.
- **Backend** : aucun serveur Node/Express — uniquement des **Supabase Edge
  Functions** (Deno, `supabase/functions/*`), déployées manuellement via
  `supabase functions deploy`. C'est déjà le backend sécurisé demandé par la
  tâche : les secrets Flatpay y vivent, jamais dans le frontend GitHub Pages.
- **Base de données** : Postgres Supabase, RLS activé partout. Tables clé :
  `orders`, `order_items`, `restaurant_settings`, `fiscal_journal`,
  `fiscal_counters`.
- **Commandes** : `create_order_secure()` (RPC Postgres, security definer)
  est le point d'entrée UNIQUE de création de commande. Elle relit les prix
  et la TVA en base (aucune confiance dans le total envoyé par le
  navigateur), décrémente le stock, valide/consomme le code promo, **assigne
  un numéro fiscal séquentiel et écrit une ligne append-only chaînée par
  hash dans `fiscal_journal`** — le tout dans une seule transaction
  atomique.
- **Paiement actuel (Stripe)** : `create-payment-intent` (edge function) crée
  un PaymentIntent Stripe avec le total envoyé par le client (voir limite
  connue plus bas). Le client confirme la carte via Stripe Elements
  (`StripeCardForm`), et **ce n'est qu'après ce succès** que le frontend
  appelle `create_order_secure` — la commande n'existe donc jamais avant
  confirmation du paiement.
- **QR codes** : génèrent une URL `/r/{slug}/t/{tableNum}`, interceptée par
  `AppInner` et routée vers `CustomerPage`. Rien à changer ici : le QR reste
  100 % WGM, Flatpay n'apparaît qu'après le clic sur "Payer en ligne".

## 2. Où se trouvait le système de paiement

Uniquement Stripe, câblé en dur dans `CustomerPayment` (`src/App.jsx`) et
`supabase/functions/create-payment-intent/index.ts`. Aucune abstraction
`PaymentProvider` n'existait avant ce travail.

**Point d'architecture important découvert en cours d'analyse** : le flux
Stripe ne crée la commande WGM (et donc le numéro fiscal) qu'APRÈS
confirmation du paiement — jamais avant, pour ne jamais assigner de numéro
fiscal à une commande dont le paiement échoue ou est abandonné (conformité
NF525, séquence gapless). La consigne de la tâche (`PENDING_PAYMENT` →
`PAYMENT_PROCESSING` → `PAID` comme statuts de **commande**) a donc été
adaptée : ces statuts vivent sur une nouvelle table `payment_attempts`,
**séparée de `orders`**, dont le statut de fulfillment (`PENDING` /
`PREPARING` / `READY` / `DONE`) reste inchangé et n'a jamais représenté un
statut de paiement. La commande WGM elle-même n'est créée qu'au moment où
`payment_attempts.status` devient `PAID` — exactement comme pour Stripe
aujourd'hui.

## 3. Ce qui a été modifié / créé

Rien d'existant n'a été modifié en profondeur — uniquement des ajouts, plus
deux tout petits changements additifs (nouvelle valeur d'enum, nouvelle
colonne) :

| Fichier | Changement |
| --- | --- |
| `supabase/migration_flatpay.sql` | **Nouveau.** Tables `payment_connections`, `payment_attempts`, `payment_events` ; colonne `restaurant_settings.payment_provider` ; RPC `price_cart_secure`, `get_payment_provider`, `get_payment_connection_status`, `disconnect_payment_provider` ; extension du check `orders.payment_mode` (+ `online_flatpay`) |
| `supabase/functions/_shared/payment_provider.ts` | **Nouveau.** Interface `PaymentProvider` (createPayment / getPaymentStatus / refundPayment) |
| `supabase/functions/_shared/flatpay.ts` | **Nouveau.** `FlatpayProvider`, entièrement configurable par variables d'environnement (aucun endpoint codé en dur — voir §7) |
| `supabase/functions/_shared/payment_finalize.ts` | **Nouveau.** Logique de confirmation idempotente, partagée entre le retour client et le webhook |
| `supabase/functions/_shared/flatpay.test.ts`, `payment_finalize.test.ts` | **Nouveau.** 23 tests (voir §9) |
| `supabase/functions/flatpay-create-payment/index.ts` | **Nouveau.** Ouvre une tentative de paiement |
| `supabase/functions/flatpay-payment-status/index.ts` | **Nouveau.** Vérifie le statut réel après retour client |
| `supabase/functions/flatpay-webhook/index.ts` | **Nouveau.** Notification serveur Flatpay |
| `supabase/functions/flatpay-refund/index.ts` | **Nouveau.** Remboursement staff |
| `supabase/functions/flatpay-save-credentials/index.ts` | **Nouveau.** Écriture sécurisée de la clé API (jamais via une table exposée au navigateur) |
| `src/App.jsx` | Additions : `PaymentProviderSection` (Réglages), branche Flatpay dans `CustomerPayment`/`payFlatpay`, nouveau composant `FlatpayPaymentReturn`, route `/r/{slug}/t/{table}/payment/{success\|cancel\|pending}`, traductions (5 langues) |
| `supabase/functions/create-payment-intent/index.ts` | **Non touché.** |
| Stripe côté front (`StripeCardForm`, `payCard`) | **Non touché.** |

## 4. Variables d'environnement nécessaires

Secrets des edge functions (`supabase secrets set`) :

| Variable | Rôle |
| --- | --- |
| `FLATPAY_API_BASE_URL` | Base URL de l'API Flatpay/Frisbii — **à confirmer**, voir §7 |
| `FLATPAY_WEBHOOK_SECRET` | Secret de vérification de signature du webhook — **à confirmer** |
| `FLATPAY_WEBHOOK_URL` | URL publique de `flatpay-webhook`, à déclarer côté Flatpay si leur API le permet |
| `FLATPAY_WEBHOOK_SIGNATURE_HEADER` | Optionnel — nom de l'en-tête de signature si différent de `X-Flatpay-Signature` |
| `FLATPAY_CREATE_PAYMENT_PATH`, `FLATPAY_GET_PAYMENT_PATH`, `FLATPAY_REFUND_PATH` | Optionnels — surchargent les chemins par défaut sans redéploiement de code |

La clé API du restaurant (`FLATPAY_API_KEY` équivalent) n'est **pas** un
secret d'edge function : elle est saisie par le restaurateur dans Réglages
et stockée dans `payment_connections` (voir §8), lue automatiquement par
toutes les fonctions ci-dessus.

Aucune variable `VITE_*` n'est nécessaire côté frontend : contrairement à
Stripe (clé publique nécessaire pour Stripe Elements), le paiement Flatpay
est un checkout hébergé — le navigateur n'a besoin que de l'URL de
redirection renvoyée par `flatpay-create-payment`.

## 5. Ce qui est déjà prêt

- Schéma de base complet, testé pour compiler (voir §9 pour les tests
  automatisés qui passent).
- Les 5 edge functions, avec authentification propriétaire correcte
  (`flatpay-save-credentials`, `flatpay-refund`), et sécurité webhook (rejet
  si signature absente/invalide/secret non configuré).
- Montant **toujours** recalculé serveur (`price_cart_secure`) avant tout
  appel à Flatpay — un total falsifié côté navigateur n'a aucun effet,
  exactement comme pour `create_order_secure`.
- Idempotence complète : double-tap client (`client_token`), webhook rejoué,
  status-check + webhook simultanés (contrainte `WHERE status IN (...)` +
  unique index) — 10 tests dédiés, tous verts.
- État de paiement affiché correctement même en cas de panne réseau Flatpay
  (reste `PAYMENT_PROCESSING`, jamais basculé à tort en échec).
- UI client (bouton, écran "paiement en cours", confirmé, échoué + bouton
  Réessayer) et UI staff (Réglages → connecter/déconnecter Flatpay, choix du
  provider actif) branchées et buildées sans erreur (`npm run build` OK,
  `eslint` sans nouvelle erreur).
- Remboursement câblé côté WGM (bouton à ajouter dans l'UI staff si besoin —
  la fonction `flatpay-refund` existe et est prête à être appelée).

## 6. Ce qui dépend encore de Flatpay

Tout ce qui touche au **format exact de leur API** — volontairement non
deviné (voir §7). Concrètement, avant le premier vrai paiement :

1. Confirmer `FLATPAY_API_BASE_URL` et le schéma d'authentification (Bearer ?
   Basic ? en-tête custom ?) — `_shared/flatpay.ts`, méthode `createPayment`.
2. Confirmer les noms de champs de la requête de création de paiement
   (`buildCreatePaymentBody`) et de la réponse (`parseCreatePaymentResponse`)
   — amount en centimes ou en unité pleine ? nom exact du champ montant,
   référence, URLs de retour ?
3. Confirmer le mécanisme de signature webhook (`verifyFlatpaySignature`) —
   HMAC-SHA256 supposé par défaut (comme HubRise), à ajuster si Flatpay fait
   autrement.
4. Confirmer si Apple Pay est proposé automatiquement par leur page de
   paiement hébergée (attendu, à vérifier en recette — WGM ne développe
   aucune logique Apple Pay propre, conformément à la consigne).
5. Confirmer le format/l'existence d'un remboursement API (`refundPayment`).
6. Obtenir un compte marchand Flatpay (test et/ou production) — rien n'a pu
   être testé en conditions réelles sans clé API.

## 7. Pourquoi rien n'a été deviné — recherche effectuée

Recherché le 2026-09-29 : **Flatpay ne publie pas de portail développeur ni
de référence API publique** pour son offre paiement en ligne. Leur solution
e-commerce est en réalité bâtie sur **Frisbii** (ex-Billwerk+), qui elle
possède une vraie documentation OpenAPI 3.0 (`docs.frisbii.com`,
`docs.frisbii-transform.com`, endpoint `POST /api/Payment` repéré dans les
résultats de recherche).

**Je n'ai pas pu lire cette documentation** : l'environnement d'exécution de
cette session bloque l'accès sortant à `help.flatpay.com`, `docs.frisbii.com`
et `docs.frisbii-transform.com` (403 au niveau du proxy réseau du sandbox —
restriction d'infrastructure, pas une limite de Flatpay). C'est une
contrainte de **cet environnement précis**, pas une absence de documentation
réelle.

Conséquence directe sur le code : `_shared/flatpay.ts` ne contient **aucune
URL d'endpoint codée en dur**. Tout passe par variables d'environnement, avec
des valeurs par défaut plausibles (forme REST/JSON standard) clairement
annotées `// CONFIRM:` à chaque endroit où un nom de champ ou un chemin
devra être vérifié. Un ajustement, une fois la doc consultée (depuis une
machine avec accès web, ou en installant l'app Flatpay pour obtenir l'accès
marchand), se limite à modifier des `supabase secrets set` et, si besoin, les
quelques fonctions pures de `flatpay.ts` — jamais une refonte.

## 8. Procédure pour connecter le compte du restaurant

1. **Obtenir les credentials** : créer/activer un compte marchand Flatpay
   Online (ou Frisbii Pay) pour le restaurant, obtenir une clé API — contact
   commercial/support Flatpay si l'auto-activation n'est pas disponible.
2. **Renseigner l'API réelle** (une fois §7 confirmé) :
   ```bash
   supabase secrets set FLATPAY_API_BASE_URL=https://...
   supabase secrets set FLATPAY_WEBHOOK_SECRET=...
   supabase secrets set FLATPAY_WEBHOOK_URL=https://<projet>.functions.supabase.co/flatpay-webhook
   # ajuster si besoin :
   # supabase secrets set FLATPAY_CREATE_PAYMENT_PATH=/...
   ```
3. **Exécuter la migration** : coller `supabase/migration_flatpay.sql` dans
   l'éditeur SQL Supabase.
4. **Déployer les fonctions** :
   ```bash
   supabase functions deploy flatpay-create-payment
   supabase functions deploy flatpay-payment-status
   supabase functions deploy flatpay-refund
   supabase functions deploy flatpay-save-credentials
   # Flatpay n'est pas un utilisateur Supabase : pas de JWT à vérifier,
   # l'authenticité repose sur la signature du corps de la requête.
   supabase functions deploy flatpay-webhook --no-verify-jwt
   ```
5. **Connecter le restaurant** : Dashboard → Paramètres → « Paiement en
   ligne » → sélectionner **Flatpay** → Enregistrer le provider, puis dans
   la carte « Flatpay » juste en dessous, choisir Test ou Production, coller
   la clé API, **Connecter Flatpay**. La clé n'est plus jamais relue par le
   navigateur ensuite (voir §5 de POS_HUBRISE.md pour le même principe déjà
   appliqué à HubRise).

## 9. Procédure pour le premier paiement test de 1 €

1. S'assurer que `payment_connections.environment = 'test'` pour ce
   restaurant (choisi à l'étape 4 ci-dessus) et que Flatpay a bien fourni des
   credentials de test distincts des credentials de production.
2. Scanner le QR code WGM d'une table → commander un article dont le prix
   ramène le total à 1,00 € (ou appliquer un code promo pour y arriver) →
   "Payer en ligne".
3. Sur la page Flatpay, payer par carte de test (ou Apple Pay si
   disponible sur l'appareil).
4. Vérifier :
   - retour automatique sur Wegemo, écran "Paiement en cours…" puis
     confirmation ;
   - `payment_attempts.status = 'PAID'` en base, avec `order_id` renseigné ;
   - la commande apparaît dans le dashboard Wegemo (Commandes en cours),
     avec `payment_mode = 'online_flatpay'` ;
   - le paiement de 1 € est visible dans le dashboard Flatpay ;
   - optionnel : déclencher `flatpay-refund` (via un appel authentifié, ou
     un bouton à ajouter dans l'UI staff) pour rembourser le 1 €.
5. Tester aussi le chemin échec : annuler le paiement côté Flatpay → vérifier
   que Wegemo affiche "Paiement non effectué" et qu'**aucune commande**
   n'apparaît côté restaurateur, ni de numéro fiscal consommé.

**Avant ce test**, lancer la suite automatisée (aucun réseau requis, valide
toute la logique interne) :

```bash
node --experimental-strip-types --test supabase/functions/_shared/flatpay.test.ts
node --experimental-strip-types --test supabase/functions/_shared/payment_finalize.test.ts
```

23 tests couvrent : construction de la requête de paiement (montant en
centimes, devise), extraction tolérante de la réponse, projection des
statuts (fail-safe : un statut inconnu n'est jamais "payé"), signature
webhook (valide/falsifiée/absente/mauvais secret), et surtout la logique de
finalisation : paiement confirmé → commande créée une seule fois, webhook
reçu deux fois → pas de doublon, montant/devise incohérents → commande
jamais créée, Flatpay injoignable → jamais marqué échoué à tort, statut
terminal → plus jamais rappelé.

Les scénarios réellement bout-en-bout (vrai paiement 1 €, vrai webhook
Flatpay) ne sont pas automatisables sans compte de test réel — c'est l'objet
du test manuel ci-dessus.

## 10. Blocages avant mise en production demain

- **Bloquant** : aucun credential Flatpay réel n'a pu être obtenu ni testé
  depuis cet environnement (voir §7). Sans eux, impossible de valider le
  parcours 1 € réel avant demain matin, sauf à disposer déjà d'un compte
  marchand Flatpay actif au moment de reprendre ce travail.
- **Bloquant potentiel** : si le format réel de l'API Flatpay/Frisbii diffère
  significativement de l'hypothèse REST/JSON standard prise ici (ex :
  SOAP, format de requête radicalement différent), `_shared/flatpay.ts`
  demande un ajustement ciblé mais réel — prévoir du temps pour lire leur
  doc et l'adapter dès qu'un accès y sera possible.
- **Non bloquant** : tout le reste de l'infrastructure WGM (schéma, edge
  functions, UI, idempotence, sécurité) est fonctionnel et testé
  indépendamment du format exact de l'API Flatpay — seule la couche
  `flatpay.ts` (implémentation `PaymentProvider`) reste à confronter à la
  vraie doc.
- **À vérifier en recette** : Apple Pay dépend entièrement de ce que la page
  de paiement hébergée Flatpay propose réellement sur l'appareil du client —
  rien côté WGM ne peut le garantir à l'avance.
