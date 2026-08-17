# Intégration caisse via HubRise (CLYO Systems)

Permet aux commandes QR code Wegemo d'arriver directement sur l'écran de caisse
du restaurateur, comme une commande Uber Eats ou Deliveroo, **avec paiement sur
place** (aucune transaction Stripe).

```
Client scanne le QR code
  → commande créée dans Wegemo (Supabase)
  → hubrise-push-order pousse la commande vers l'API HubRise
  → HubRise traduit et transmet à la caisse (CLYO)
  → la commande s'affiche sur l'écran de caisse
  → les statuts redescendent CLYO → HubRise → hubrise-webhook → Wegemo
```

Wegemo n'intègre **qu'une seule API : celle de HubRise**. Brancher une autre
caisse compatible HubRise ne demande aucun développement supplémentaire ici :
seul le libellé `pos_connections.pos_vendor` change.

## Séparation stricte d'avec Stripe

Deux flux de paiement coexistent et ne se croisent jamais :

| `orders.payment_mode` | Déclenché par | Paiement | Envoi caisse |
| --- | --- | --- | --- |
| `online_stripe` | bouton carte | PaymentIntent Stripe | non |
| `pay_at_counter` | bouton espèces | encaissement physique | oui |

Trois garde-fous :

1. `createOrder()` (front) fixe `payment_mode` selon le moyen choisi et n'appelle
   `hubrise-push-order` que pour `pay_at_counter`.
2. `hubrise-push-order` **refuse** (400 `not_a_counter_payment_order`) toute
   commande dont le `payment_mode` n'est pas `pay_at_counter`.
3. Le payload envoyé à HubRise **n'a pas de tableau `payments`**. HubRise
   considère alors la commande comme non payée, donc à encaisser en caisse.
   Un test (`PAIEMENT EN CAISSE : aucun tableau payments n'est émis`) échoue si
   quelqu'un ajoute un paiement par inadvertance.

## Installation

### 1. Base de données

Exécuter `supabase/migration_pos_hubrise.sql` dans l'éditeur SQL Supabase.

### 2. Créer l'application HubRise

Depuis le compte développeur HubRise, créer une app et noter `client_id` /
`client_secret`. Déclarer comme URL de redirection l'URL du dashboard Wegemo
(celle depuis laquelle le restaurateur clique « Connecter ma caisse »).

### 3. Variables d'environnement

Secrets des edge functions (`supabase secrets set`) :

| Variable | Rôle |
| --- | --- |
| `HUBRISE_CLIENT_ID` | id de l'app HubRise |
| `HUBRISE_CLIENT_SECRET` | secret de l'app — sert aussi à vérifier la signature des webhooks |
| `HUBRISE_WEBHOOK_URL` | URL publique de `hubrise-webhook`, enregistrée comme callback |

Variable de build du front (`.env`) :

| Variable | Rôle |
| --- | --- |
| `VITE_HUBRISE_CLIENT_ID` | même id, pour construire l'URL d'autorisation |

Le `client_secret` ne doit **jamais** figurer dans une variable `VITE_*` : tout
ce qui est préfixé ainsi est embarqué dans le bundle navigateur.

### 4. Déployer les fonctions

```bash
supabase functions deploy hubrise-connect
supabase functions deploy hubrise-sync-catalog
supabase functions deploy hubrise-push-order
# HubRise n'est pas un utilisateur Supabase : pas de JWT à vérifier.
# L'authenticité repose sur la signature HMAC du corps de la requête.
supabase functions deploy hubrise-webhook --no-verify-jwt
```

### 5. Connexion par le restaurateur

Dashboard → Paramètres → « Caisse (CLYO via HubRise) » → **Connecter ma caisse**,
puis **Synchroniser le menu**.

> La synchronisation du catalogue est obligatoire avant la première commande :
> la caisse ne reconnaît une ligne que si son `sku_ref` existe dans son
> catalogue. L'écran affiche un avertissement tant qu'elle n'a pas eu lieu.

## Sécurité du token

Le token d'accès HubRise vit dans `pos_connections`, table dont **RLS est activé
sans aucune policy** : ni la clé anon ni un utilisateur authentifié ne peuvent la
lire, seules les edge functions (service-role) y accèdent. Le dashboard lit
l'état de connexion via `get_pos_connection_status()`, fonction `security
definer` qui vérifie la propriété et ne projette aucun secret.

C'est plus strict que le stockage des clés Stripe dans `restaurant_settings`,
lisible par le propriétaire depuis le navigateur.

## Gestion des erreurs

| Situation | Comportement |
| --- | --- |
| Caisse/HubRise injoignable (5xx, réseau) | 3 tentatives avec repli exponentiel, puis `pos_sync_status = failed` et message au restaurateur |
| Quota dépassé (429) | retenté comme une erreur transitoire |
| Article inconnu du catalogue (4xx) | **pas de retry** — définitif, remonté immédiatement ; corriger via « Synchroniser le menu » |
| Caisse non connectée | `pos_sync_status = not_applicable`, la commande reste gérée dans la vue cuisine Wegemo |
| Double envoi | idempotent : `pos_order_id` déjà présent ⇒ aucun nouvel envoi |

Un échec de transmission **n'invalide jamais la commande** : elle reste visible
en cuisine Wegemo. Les 8 derniers échanges sont affichés dans l'écran admin, et
tout l'historique est dans `pos_sync_log`.

## Tests

```bash
node --experimental-strip-types --test supabase/functions/_shared/hubrise.test.ts
```

17 tests couvrent : format monétaire, structure du catalogue, exclusion des
articles indisponibles, options/suppléments, commande simple, absence de
`payments`, projection des statuts, signature HMAC (valide, falsifiée, absente,
mauvais secret), retry sur 5xx, absence de retry sur 4xx, épuisement des
tentatives, en-tête d'authentification.

Les scénarios de bout en bout (commande réellement affichée sur une caisse CLYO)
demandent un compte HubRise de test et ne sont pas automatisés.

## Contrat API vérifié

Relevé le 2026-08-09 depuis la documentation HubRise et le client officiel
[`HubRise/ruby-client`](https://github.com/HubRise/ruby-client/blob/master/V1_ENDPOINTS.md) :

- OAuth : `https://manager.hubrise.com/oauth2/v1/authorize` puis `/token`
- API : `https://api.hubrise.com/v1`, en-tête `X-Access-Token`
- Commande : `POST /locations/{locationId}/orders`
- Catalogue : `POST /location/catalogs`, `PUT /catalogs/{catalogId}`
- Callback : `POST /callback` avec `{ url, events: { order: ["create","update"] } }`
- Signature : HMAC-SHA256 du corps brut, en-tête `X-HubRise-Hmac-SHA256`

Particularités à ne pas perdre de vue :

- les montants sont des **chaînes** suffixées de la devise (`"12.95 EUR"`) ;
- `quantity` est également une chaîne ;
- il n'existe **pas** de champ `payment_status` ;
- le tableau du catalogue s'appelle `options_lists` (pluriel aux deux mots)
  alors que les SKU y réfèrent via `option_list_refs`.

## Points à confirmer en recette

Ces éléments n'ont pas pu être validés contre un compte HubRise réel :

- valeurs exactes acceptées par `service_type` (on émet `eat_in` / `collection`) ;
- forme précise de l'enveloppe d'événement webhook (`resource_type`,
  `event_type`, `new_state`) — le code tolère plusieurs variantes ;
- encodage de la signature (base64 supposé) ;
- champs `collection_code` et `total` à la racine de la commande.

Tout est isolé dans `supabase/functions/_shared/hubrise.ts` : un ajustement se
fait à un seul endroit.

## Limites connues

- Les suppléments choisis par le client sont stockés en texte libre dans
  `order_items.detail` côté Wegemo. Ils sont transmis en note de ligne plutôt
  qu'en options structurées, faute de référence exploitable à l'envoi — la
  caisse les affiche mais ne les facture pas séparément.
- La synchronisation du catalogue est manuelle (bouton). Un déclenchement
  automatique à chaque modification du menu reste à câbler.
- Aucun rafraîchissement de token : HubRise délivre des tokens longue durée. Si
  ce n'est plus le cas, il faudra gérer le `refresh_token`.
