# Thème Baoma — page de commande client

Reprend le design du site vitrine Baoma (grille 2 colonnes, tilt 3D au
survol/appui, halo orange, Ken Burns sur les photos, frise de catégories qui
suit le scroll) et le branche sur le moteur de commande Wegemo existant :
panier, paiement et vue cuisine sont inchangés.

## Activation en production (2 étapes)

1. **Connecte-toi au moins une fois** au dashboard Wegemo avec ton compte
   (`agencywgm@gmail.com`) — ça crée ta ligne dans `profiles`.
2. **Colle `supabase/seed_baoma.sql`** dans l'éditeur SQL Supabase et exécute.
   Le script crée le restaurant `baoma`, ses 13 tables (0 → 12) et ses 49
   produits. Il est idempotent : réexécutable sans doublon.

   > Si tu utilises un autre email, change-le en haut du script.

La page client est alors sur `/r/baoma/t/{numéro de table}`.
Les commandes arrivent en temps réel dans la vue cuisine habituelle.

## Aperçu sans Supabase

Sans variables d'environnement Supabase, `/r/baoma/t/1` fonctionne en mode
démo hors ligne avec la même carte (données de `src/baomaData.js`) — utile pour
valider le rendu, mais les commandes ne partent nulle part.

## Ce qui est spécifique à Baoma

| Élément | Emplacement |
| --- | --- |
| Palette, typo, ordre + accroches des catégories | `src/baomaData.js` |
| Carte de démo hors ligne (49 produits) | `src/baomaData.js` |
| Composants `BaomaMenu` / `BaomaCard`, hooks tilt & reveal | `src/App.jsx` |
| Keyframes Ken Burns + révélation | `src/index.css` (bloc « THÈME BAOMA ») |
| Photos des plats | `public/menu/*.jpg` (49 fichiers) |
| Seed base de données | `supabase/seed_baoma.sql` |

Le rendu ne s'active que si `restaurant.slug === "baoma"`. Tous les autres
restaurants continuent d'utiliser `<CustomerMenu />` sans aucun changement.

## Personnaliser les photos

Deux options :

- **Via le dashboard** — l'onglet Menu permet déjà de changer la photo d'un
  plat ; `photo_url` accepte une URL Supabase Storage. Elle prend le pas sur le
  fichier statique.
- **En statique** — remplace le `.jpg` correspondant dans `public/menu/` en
  gardant le même nom de fichier.

## Limites connues

- Les catégories restent la colonne texte `menu_items.category` : leur ordre et
  leurs accroches sont codés dans `BAOMA_CATEGORIES` (`src/baomaData.js`), pas
  en base. Ajouter une catégorie côté dashboard l'affichera en fin de liste,
  sans accroche.
- Le thème est câblé sur le slug `baoma`. Pour un deuxième restaurant, il
  faudra extraire ces constantes vers `restaurant_settings`.
- Le récapitulatif panier réutilise le composant Wegemo standard (emoji, pas
  photo).
