# Paiement en ligne avec Adyen

Wegemo gère Adyen par **lien de paiement hébergé** (Pay by Link) : le client clique « Payer en ligne », est redirigé vers une page Adyen sécurisée (carte, et Apple Pay / Google Pay selon ce qui est activé sur votre compte), puis revient sur Wegemo. Aucune donnée de carte ne transite par Wegemo.

**Sécurité** : une commande n'est créée qu'à réception d'une notification (webhook) Adyen **signée HMAC** confirmant l'autorisation, avec montant et compte marchand vérifiés. Le retour du navigateur seul ne prouve jamais un paiement. Le montant est recalculé côté serveur, options (frites, boissons…) comprises, à partir de la carte en base.

> ⚠️ Non testé contre un vrai compte Adyen (aucun identifiant disponible lors du développement) : la signature HMAC est validée sur l'exemple officiel de la doc Adyen, le reste sur des simulations. Faites le test à 1 € ci-dessous avant d'ouvrir au public. Tarifs, minimums et activation de « Pay by Link » : à confirmer auprès d'Adyen.

## 1. Créer le compte Adyen
1. Demandez un compte sur adyen.com (le compte de **test** est gratuit : https://www.adyen.com/signup). Pour encaisser en vrai, Adyen fait une vérification d'entreprise (KYC : Kbis, pièce d'identité, IBAN).
2. Dans le **Customer Area**, notez le nom de votre **compte marchand** (*Merchant account*, ex. `BaomaFR`), en haut à gauche.
3. Vérifiez que **Pay by Link** est activé (Developers / Paiements → *Payment links*) ; sinon demandez-le au support Adyen. Activez aussi les moyens de paiement voulus (Cartes, Apple Pay, Google Pay…) dans *Settings → Payment methods*.

## 2. Clé API
*Developers → API credentials* → créer (ou ouvrir) un identifiant de type **Web service** :
- rôle **Checkout webservice** (nécessaire aux liens de paiement) ;
- *Generate API key* → copiez-la (affichée une seule fois) ;
- vérifiez que votre compte marchand est bien rattaché à cet identifiant.

## 3. Préfixe d'URL live (production uniquement)
*Developers → API URLs* : copiez le préfixe de l'URL live (ex. `1797a841fbb37ca7-AdyenDemo` dans `https://1797a841fbb37ca7-AdyenDemo-checkout-live.adyenpayments.com`). Inutile en mode test.

## 4. Base de données et fonctions (une fois)
1. Supabase → SQL Editor : exécutez `supabase/migration_flatpay.sql` (si pas déjà fait) puis `supabase/migration_adyen.sql`.
2. Déployez les fonctions :
```bash
supabase functions deploy adyen-create-payment adyen-payment-status adyen-save-credentials adyen-refund
supabase functions deploy adyen-webhook --no-verify-jwt
```

## 5. Webhook (indispensable)
*Developers → Webhooks → Add → Standard webhook* :
- **URL** : `https://<votre-projet>.supabase.co/functions/v1/adyen-webhook`
- Méthode **JSON**, événements par défaut (AUTHORISATION suffit).
- *Generate HMAC key* → copiez la clé (64 caractères hexadécimaux), **à coller dans Wegemo** (étape 6).
- (Optionnel) identifiant/mot de passe Basic auth : définissez les mêmes valeurs en secrets Supabase `ADYEN_WEBHOOK_USER` et `ADYEN_WEBHOOK_PASS`.
- Activez le webhook. Un test « Test webhook » d'Adyen doit répondre `[accepted]`.

## 6. Connecter dans Wegemo
Dashboard → **Paramètres** → *Paiement en ligne* → choisir **Adyen** → *Enregistrer le provider*, puis renseigner : clé API, compte marchand, (préfixe live si Production), clé HMAC → **Connecter Adyen**. Wegemo teste la clé auprès d'Adyen avant d'afficher « connecté ».

## 7. Test à 1 €
En mode Test, commandez sur un QR de table, choisissez « Payer en ligne », payez avec la carte de test Adyen `4111 1111 1111 1111`, date future, CVC `737`, nom au choix (3DS : mot de passe `password`). Vous devez revenir sur Wegemo avec la commande confirmée. Si l'écran reste sur « paiement en cours » : webhook mal configuré (URL, clé HMAC, compte marchand) → *Developers → Webhooks → Logs* chez Adyen, et table `payment_events` dans Supabase.

## 8. Passage en production
Compte Adyen validé → clé API **live**, préfixe live, nouveau webhook **live** (nouvelle clé HMAC) → reconnecter en mode *Production* dans Paramètres.

## Remboursement
Fonction `adyen-refund` (`order_id`, `amount` optionnel) réservée au propriétaire ; sinon depuis le Customer Area Adyen.
