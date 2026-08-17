# Installation de Wegemo

Temps prévu : 20 à 30 minutes.

---

## ⚠️ À lire avant l'ouverture — certification NF525

Un logiciel de caisse utilisé par un assujetti à la TVA doit être **certifié par
un organisme accrédité** (NF525 / LNE) au titre de l'article 286-I-3° bis du CGI.
La loi de finances 2025 a **supprimé l'option de l'attestation individuelle de
l'éditeur**, qui était la voie habituellement empruntée par un logiciel interne.
Le défaut de justificatif est sanctionné par une amende de **7 500 € par
logiciel**, avec 60 jours pour régulariser.

Wegemo implémente les **propriétés techniques** exigées (voir plus bas), mais
**ne constitue pas un logiciel certifié**. La certification est une démarche
administrative distincte, payante, à engager auprès d'un organisme accrédité.

**Fais valider ta situation par ton comptable avant l'ouverture** : selon ton
activité et ton mode d'encaissement, l'obligation peut ou non s'appliquer, et
les dates d'entrée en vigueur ont évolué récemment.

Ce que le code fournit réellement :

| Exigence | Mise en œuvre |
|---|---|
| **Inaltérabilité** | Journal `fiscal_journal` en append-only, `UPDATE` et `DELETE` bloqués par trigger, chaînage SHA-256 de chaque écriture sur la précédente |
| **Sécurisation** | Numérotation séquentielle sans rupture par restaurant et par an ; montants recalculés côté serveur, jamais transmis par le navigateur |
| **Conservation** | Ventilation de TVA figée à l'encaissement, jamais recalculée à la réimpression |
| **Archivage** | `verify_fiscal_chain()` recalcule toute la chaîne et localise la première rupture éventuelle |

---

## 1. Base de données

Dans **Supabase → SQL Editor**, colle et exécute le contenu de
`supabase/install.sql`.

> L'éditeur SQL de Supabase ne gère pas la commande `\i`. Colle donc les
> fichiers dans l'ordre listé en tête de `install.sql`, ou exécute
> `psql "<connection string>" -f supabase/install.sql` depuis ton poste.

Le script est **rejouable** : le relancer sur une base existante ne casse rien
et applique uniquement les nouveautés. Il se termine par un contrôle qui échoue
explicitement si une brique manque.

## 2. Storage

**Storage → New bucket** → nom `assets`, coché **public**. Sert aux photos des
plats et aux visuels du menu client.

## 3. Authentification

**Authentication → Providers** → activer **Email**.

## 4. Edge functions

Déploie le contenu de `supabase/functions/`. Chaque fichier est autonome et se
colle directement dans l'éditeur de fonctions Supabase.

⚠️ `hubrise-webhook` doit être déployée **avec la vérification JWT désactivée**
(`--no-verify-jwt`) : son authenticité repose sur la signature HMAC, pas sur un
JWT.

Variables d'environnement à renseigner selon les modules utilisés :
`STRIPE_SECRET_KEY`, `RESEND_API_KEY`, `OPENAI_API_KEY`,
`HUBRISE_CLIENT_ID`, `HUBRISE_CLIENT_SECRET`.

## 5. Front

Dans les secrets GitHub du dépôt :

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_STRIPE_PUBLISHABLE_KEY   (si paiement en ligne)
VITE_HUBRISE_CLIENT_ID        (si caisse externe)
```

Le déploiement GitHub Pages part automatiquement à chaque push.

## 6. Paramétrage du restaurant

Dans le dashboard :

1. **Paramètres → Ticket de caisse** : adresse, téléphone, SIRET, n° de TVA
   intracommunautaire, message de pied de ticket. Ces mentions figurent sur
   chaque ticket imprimé.
2. **Carte** : pour chaque article, vérifie le **taux de TVA**.
   Repères en restauration : **10 %** sur place et vente à emporter en
   consommation immédiate, **20 %** sur les boissons alcoolisées, **5,5 %**
   sur l'alimentaire conditionné à consommation différée. En cas de doute,
   demande à ton comptable — un taux erroné fausse la déclaration de TVA.
3. **QR Codes** : imprime et dispose les QR sur les tables.

## 7. Impression des tickets

L'écran **Cuisine** imprime automatiquement chaque nouvelle commande sur
l'imprimante par défaut du poste où il est ouvert. Garde ce navigateur ouvert
sur l'ordinateur relié à l'imprimante.

Par défaut, le navigateur affiche une boîte de dialogue à chaque impression.
Pour une impression **silencieuse**, lance Chrome ainsi :

```bash
# Windows
chrome.exe --kiosk-printing --app=https://<ton-domaine>/#/kitchen

# macOS
open -a "Google Chrome" --args --kiosk-printing --app=https://<ton-domaine>/#/kitchen
```

---

## Vérifier l'installation

Sur une base **de test** (jamais en production, le journal fiscal est
volontairement non-effaçable) :

```bash
createdb wegemo_test
psql -d wegemo_test -f supabase/test_bootstrap.sql   # simule Supabase (schéma auth, rôles)
psql -d wegemo_test -f supabase/install.sql
psql -d wegemo_test -f supabase/test_fiscal.sql      # 16 assertions
```

La suite vérifie la ventilation de TVA multi-taux, la numérotation séquentielle,
l'idempotence, le refus de survente, les limites de promotions et le refus de
toute altération du journal.

---

## Ce qui est protégé côté serveur

Ces règles sont appliquées dans `create_order_secure`, en base, dans une seule
transaction. Elles ne peuvent pas être contournées depuis le navigateur.

- **Le montant n'est jamais transmis par le client.** Les prix et taux de TVA
  sont relus en base à chaque commande.
- **Pas de survente.** La décrémentation du stock porte sa condition dans le
  `WHERE` : deux commandes simultanées sur le dernier article ne peuvent pas
  aboutir toutes les deux.
- **Promotions maîtrisées.** Dates de validité et nombre maximal d'utilisations
  vérifiés sous verrou.
- **Pas de doublon.** Un jeton d'idempotence rend le double-clic et la reprise
  réseau sans effet.
