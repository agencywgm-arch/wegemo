// Données Baoma — générées depuis bao-test-/src/data/assets.ts.
// Servent au mode démo (sans Supabase) ; en production les mêmes plats sont
// lus depuis menu_items après exécution de supabase/seed_baoma.sql.

export const BAOMA_SLUG = "baoma";

// Palette et typo reprises du site vitrine Baoma (src/index.css @theme).
// ink = fond sombre, charcoal = fond des cartes, offwhite = texte clair.
export const BAOMA_THEME = {
  ink: "#0a0a0a", charcoal: "#161310", orange: "#ff5a1f",
  orangeDeep: "#c2410c", offwhite: "#f2ece0",
  display: "'Cormorant Garamond', 'Playfair Display', serif",
};

// Ordre d'affichage + accroche de chaque catégorie (pas de table dédiée :
// la colonne menu_items.category reste un texte plat côté base).
export const BAOMA_CATEGORIES = [
  { name: "Formules", tagline: "Menu Midi & Menu Enfant" },
  { name: "Bao Créations", tagline: "Tous nos burgers sont servis avec frites" },
  { name: "Smash Bao", tagline: "Tous nos burgers sont servis avec frites" },
  { name: "Smash Burger", tagline: "Tous nos burgers sont servis avec frites" },
  { name: "Asian Fusion", tagline: "L'asie dans une seule assiette" },
  { name: "Starters", tagline: "Pour bien commencer" },
  { name: "Starters Signatures", tagline: "Nos créations maison" },
  { name: "Wings", tagline: "Ailes de poulet marinées et grillées" },
  { name: "Sides", tagline: "Suppléments & accompagnements" },
  { name: "Desserts", tagline: "Pour finir en douceur" },
  { name: "Mojitos & Boissons", tagline: "Faits minute, sans alcool" },
];

// Options proposées dans la fenêtre de composition d'un plat. Stockées dans
// menu_items.supplements, avec deux clés optionnelles :
//   group  -> regroupe les options sous un titre ; en liste déroulante à choix
//             unique (Frites, Boisson) ou, avec multi:true, en cases à cocher
//             (Retirer, Extras) ;
//   sans `group`, un supplément reste une simple case à cocher (comportement
//   historique des autres restos).
// Prix = ceux de la carte : frites "avec Bao burger" (la frite maison est
// incluse dans le burger), boissons au tarif carte.
const FRITES_VARIANTES = [
  { name: "Frites Paprika", price: 1.2 },
  { name: "Frites de Patate Douce", price: 1.6 },
  { name: "Frites Cheddar Maison", price: 1.5 },
  { name: "Frites Bacon Cheddar", price: 3 },
];
// Wings : pas de frites incluses, « Sans frites » ne change pas le prix.
const FRITES_OPTIONS = [{ name: "Sans frites", price: 0 }, ...FRITES_VARIANTES].map((o) => ({ ...o, group: "Frites" }));
// Burgers : la frite maison est incluse, y renoncer retire 3 € du prix.
const BURGER_FRITES = [{ name: "Sans frites", price: -3 }, ...FRITES_VARIANTES].map((o) => ({ ...o, group: "Frites" }));

const BOISSON_OPTIONS = [
  ...["Pepsi", "Pepsi Zero", "Sprite", "Schweppes Pomme", "Schweppes Agrumes", "Orangina", "Oasis Tropical", "Ice Tea", "Perrier", "Eau"].map((name) => ({ name, price: 1.5 })),
  ...["Mojito Violette", "Mojito Passion", "Mojito Cerise", "Mojito Kiwi", "Mojito Classique", "Thé Glacé Maison"].map((name) => ({ name, price: 5.5 })),
].map((o) => ({ ...o, group: "Boisson" }));

// ⚠️ Prix de l'extra viande : à confirmer avec le restaurant (non fourni).
export const EXTRA_VIANDE_PRICE = 3;
const EXTRA_VIANDE = { name: "Extra viande", price: EXTRA_VIANDE_PRICE, group: "Extras", multi: true };

const retirer = (...names) => names.map((n) => ({ name: n, price: 0, group: "Retirer", multi: true }));
// Retraits proposés sur TOUS les burgers : toujours salade, pickles et oignons
// confits — sauf le Smash Truffé, qui a des oignons frits.
const BURGER_RETRAITS = ["Sans salade", "Sans pickles", "Sans oignons confits"];
const TRUFFE_RETRAITS = ["Sans salade", "Sans pickles", "Sans oignons frits"];

// Formule Midi : un burger au choix, inclus dans le prix (choix obligatoire).
const MIDI_BURGERS = ["Bao Végé", "Fried Chicken / Spicy", "Smash Cheese", "Smash Bao Burger", "Chicken Thaï"]
  .map((name) => ({ name, price: 0, group: "Burger", required: true }));

const RIZ_RETRAITS = retirer("Sans piment", "Sans graine de sésame", "Sans coriandre");

// Crazy Champi : deux versions au même prix, choix obligatoire.
const CRAZY_VERSIONS = ["Viande hachée", "Fried chicken"].map((name) => ({ name, price: 0, group: "Version", required: true }));

const BURGER_CATEGORIES = ["Bao Créations", "Smash Bao", "Smash Burger"];

// Options d'un plat selon sa catégorie : burgers = retraits + extra viande +
// frites + boisson ; wings = frites + boisson ; bowls = retraits + boisson.
export function baomaOptionsFor(item) {
  if (item.id === "baoma-menu-midi") return MIDI_BURGERS;
  if (BURGER_CATEGORIES.includes(item.category)) {
    const retraits = item.id === "baoma-smash-truffe" ? TRUFFE_RETRAITS : BURGER_RETRAITS;
    const versions = item.id === "baoma-crazy-champi" ? CRAZY_VERSIONS : [];
    return [...versions, ...retirer(...retraits), EXTRA_VIANDE, ...BURGER_FRITES, ...BOISSON_OPTIONS];
  }
  if (item.category === "Wings") return [...FRITES_OPTIONS, ...BOISSON_OPTIONS];
  if (item.category === "Asian Fusion") return [...RIZ_RETRAITS, ...BOISSON_OPTIONS];
  return null;
}

const BAOMA_MENU_BASE = [
  { id: "baoma-boeuf-croustillant-burger", restaurant_id: "baoma-demo", name: "Boeuf Croustillant", description: "Boeuf croustillant, sauce maison, cheddar fondu", price: 14.9, category: "Bao Créations", emoji: "🍽️", photo_url: "/menu/boeuf-croustillant-burger.jpg", is_popular: false, available: true, stock: null, supplements: [], extras: [], sort_order: 1, is_menu: false },
  { id: "baoma-boeuf-fondant", restaurant_id: "baoma-demo", name: "Boeuf Fondant", description: "Boeuf fondant mijoté, oignons caramélisés, cheddar fondu", price: 14.9, category: "Bao Créations", emoji: "🍽️", photo_url: "/menu/boeuf-fondant.jpg", is_popular: false, available: true, stock: null, supplements: [], extras: [], sort_order: 2, is_menu: false },
  { id: "baoma-fried-chicken-spicy", restaurant_id: "baoma-demo", name: "Fried Chicken / Spicy", description: "Poulet pané, sauce épicée aigre-douce, sésame", price: 12.9, category: "Bao Créations", emoji: "🍽️", photo_url: "/menu/fried-chicken-spicy.jpg", is_popular: false, available: true, stock: null, supplements: [], extras: [], sort_order: 4, is_menu: false },
  { id: "baoma-chicken-thai", restaurant_id: "baoma-demo", name: "Chicken Thaï", description: "Poulet grillé façon thaï, oignons rouges, cheddar fondu", price: 12.9, category: "Bao Créations", emoji: "🍽️", photo_url: "/menu/chicken-thai-burger.jpg", is_popular: false, available: true, stock: null, supplements: [], extras: [], sort_order: 5, is_menu: false },
  { id: "baoma-bao-vege", restaurant_id: "baoma-demo", name: "Bao Végé", description: "Oeuf au plat, salade, oignons rouges, sésame", price: 12.9, category: "Bao Créations", emoji: "🍽️", photo_url: "/menu/bao-vege.jpg", is_popular: false, available: true, stock: null, supplements: [], extras: [], sort_order: 6, is_menu: false },
  { id: "baoma-bao-fried-chicken-moutarde-miel", restaurant_id: "baoma-demo", name: "Bao Fried Chicken Moutarde-Miel", description: "Poulet croustillant, cheddar fondu, sauce miel moutarde, salade", price: 12.9, category: "Bao Créations", emoji: "🍽️", photo_url: "/menu/bao-fried-chicken-moutarde-miel.jpg", is_popular: false, available: true, stock: null, supplements: [], extras: [], sort_order: 7, is_menu: false },
  { id: "baoma-crazy-champi", restaurant_id: "baoma-demo", name: "Crazy Champi", description: "Double steak smashé ou fried chicken, champignons, sauce crémeuse maison", price: 17.9, category: "Smash Bao", emoji: "🍽️", photo_url: "/menu/crazy-champi.jpg", is_popular: false, available: true, stock: null, supplements: [], extras: [], sort_order: 8, is_menu: false },
  { id: "baoma-smash-bao-burger", restaurant_id: "baoma-demo", name: "Smash Bao Burger", description: "Steak smashé, champignons confits, sauce crémeuse", price: 13.9, category: "Smash Bao", emoji: "🍽️", photo_url: "/menu/smash-bao-burger.jpg", is_popular: false, available: true, stock: null, supplements: [], extras: [], sort_order: 10, is_menu: false },
  { id: "baoma-konoha-smash", restaurant_id: "baoma-demo", name: "Konoha Smash", description: "Double steak smashé, double cheddar fondu, oignons rouges confits", price: 14.9, category: "Smash Bao", emoji: "🍽️", photo_url: "/menu/konoha-smash.jpg", is_popular: false, available: true, stock: null, supplements: [], extras: [], sort_order: 11, is_menu: false },
  { id: "baoma-smash-cheese", restaurant_id: "baoma-demo", name: "Smash Cheese", description: "Steak smashé, cheddar fondu, oignons rouges, sauce maison", price: 14.9, category: "Smash Bao", emoji: "🍽️", photo_url: "/menu/smash-cheese.jpg", is_popular: false, available: true, stock: null, supplements: [], extras: [], sort_order: 13, is_menu: false },
  { id: "baoma-smash-truffee", restaurant_id: "baoma-demo", name: "Smash Truffée", description: "Double steak smashé, champignons grillés, double cheddar, sauce crémeuse à la truffe", price: 17.9, category: "Smash Bao", emoji: "🍽️", photo_url: "/menu/smash-truffee.jpg", is_popular: false, available: true, stock: null, supplements: [], extras: [], sort_order: 14, is_menu: false },
  { id: "baoma-smash-truffe", restaurant_id: "baoma-demo", name: "Smash Truffé", description: "Double steak smashé, oignons croustillants frits, sauce crémeuse à la truffe, mozzarella, salade, pickles", price: 14.9, category: "Smash Burger", emoji: "🍽️", photo_url: "/menu/smash-braise.jpg", is_popular: false, available: true, stock: null, supplements: [], extras: [], sort_order: 50, is_menu: false },
  { id: "baoma-smash-chevre-miel", restaurant_id: "baoma-demo", name: "Smash Chèvre Miel", description: "Double steak smashé, chèvre fondant, miel, salade, oignons confits, pickles, sauce Tokyo", price: 14.9, category: "Smash Burger", emoji: "🍽️", photo_url: "/menu/smash-chevre-miel.jpg", is_popular: false, available: true, stock: null, supplements: [], extras: [], sort_order: 51, is_menu: false },
  { id: "baoma-smash-bacon", restaurant_id: "baoma-demo", name: "Smash Bacon", description: "Double steak smashé, double cheddar, sauce Tokyo, bacon, oignons confits, salade, pickles", price: 14.9, category: "Smash Burger", emoji: "🍽️", photo_url: "/menu/smash-bacon.jpg", is_popular: false, available: true, stock: null, supplements: [], extras: [], sort_order: 52, is_menu: false },
  { id: "baoma-smash-braise", restaurant_id: "baoma-demo", name: "Smash Braisé", description: "Double steak smashé, bœuf braisé, oignons confits, pickles, salade, sauce Tokyo", price: 14.9, category: "Smash Burger", emoji: "🍽️", photo_url: "/menu/smash-oignon.jpg", is_popular: false, available: true, stock: null, supplements: [], extras: [], sort_order: 53, is_menu: false },
  { id: "baoma-boeuf-croustillant-bowl", restaurant_id: "baoma-demo", name: "Boeuf Croustillant", description: "Riz vinaigré, boeuf croustillant, oeuf mariné, légumes sautés", price: 14.9, category: "Asian Fusion", emoji: "🍽️", photo_url: "/menu/boeuf-croustillant-bowl.jpg", is_popular: false, available: true, stock: null, supplements: [], extras: [], sort_order: 15, is_menu: false },
  { id: "baoma-crousty-chicken", restaurant_id: "baoma-demo", name: "Crousty Chicken", description: "Riz vinaigré, poulet croustillant, oeuf mariné, légumes sautés", price: 13.9, category: "Asian Fusion", emoji: "🍽️", photo_url: "/menu/crousty-chicken.jpg", is_popular: false, available: true, stock: null, supplements: [], extras: [], sort_order: 16, is_menu: false },
  { id: "baoma-poulet-thai", restaurant_id: "baoma-demo", name: "Poulet Thaï", description: "Riz vinaigré, poulet grillé façon thaï, oeuf mariné", price: 13.5, category: "Asian Fusion", emoji: "🍽️", photo_url: "/menu/poulet-thai.jpg", is_popular: false, available: true, stock: null, supplements: [], extras: [], sort_order: 18, is_menu: false },
  { id: "baoma-crevette-thai", restaurant_id: "baoma-demo", name: "Crevette Thaï", description: "Riz vinaigré, crevettes sautées, oeuf mariné, légumes croquants", price: 14.9, category: "Asian Fusion", emoji: "🍽️", photo_url: "/menu/crevette-thai.jpg", is_popular: false, available: true, stock: null, supplements: [], extras: [], sort_order: 19, is_menu: false },
  { id: "baoma-nems-poulet", restaurant_id: "baoma-demo", name: "Nêms Poulet", description: "2 pièces, sauce aigre-douce", price: 3.9, category: "Starters", emoji: "🍽️", photo_url: "/menu/nems-poulet.jpg", is_popular: false, available: true, stock: null, supplements: [], extras: [], sort_order: 20, is_menu: false },
  { id: "baoma-nems-crevette", restaurant_id: "baoma-demo", name: "Nêms Crevette", description: "2 pièces, sauce aigre-douce", price: 3.9, category: "Starters", emoji: "🍽️", photo_url: "/menu/nems-crevette.jpg", is_popular: false, available: true, stock: null, supplements: [], extras: [], sort_order: 21, is_menu: false },
  { id: "baoma-tempura-crevette", restaurant_id: "baoma-demo", name: "Tempura Crevette", description: "2 pièces, sauce aigre-douce", price: 3.9, category: "Starters", emoji: "🍽️", photo_url: "/menu/tempura-crevette.jpg", is_popular: false, available: true, stock: null, supplements: [], extras: [], sort_order: 23, is_menu: false },
  { id: "baoma-chicken-rasengan", restaurant_id: "baoma-demo", name: "Chicken Rasengan", description: "Bouchées de poulet pané, sauce Rasengan épicée, coriandre", price: 6.9, category: "Starters Signatures", emoji: "🍽️", photo_url: "/menu/chicken-rasengan.jpg", is_popular: false, available: true, stock: null, supplements: [], extras: [], sort_order: 24, is_menu: false },
  { id: "baoma-chidori-shrimp", restaurant_id: "baoma-demo", name: "Chidori Shrimp", description: "Crevettes panées croustillantes, sauce épicée signature, coriandre", price: 7.9, category: "Starters Signatures", emoji: "🍽️", photo_url: "/menu/chidori-shrimp.jpg", is_popular: false, available: true, stock: null, supplements: [], extras: [], sort_order: 25, is_menu: false },
  { id: "baoma-boeuf-fromage", restaurant_id: "baoma-demo", name: "Boeuf Fromage", description: "2 pièces, boeuf mariné, cheddar fondant, glaçage sésame", price: 6, category: "Starters Signatures", emoji: "🍽️", photo_url: "/menu/boeuf-fromage.jpg", is_popular: false, available: true, stock: null, supplements: [], extras: [], sort_order: 26, is_menu: false },
  { id: "baoma-boeuf-fromage-crunchy", restaurant_id: "baoma-demo", name: "Boeuf Fromage Crunchy", description: "2 pièces, panure croustillante, coeur cheddar fondant", price: 6.9, category: "Starters Signatures", emoji: "🍽️", photo_url: "/menu/boeuf-fromage-crunchy.jpg", is_popular: false, available: true, stock: null, supplements: [], extras: [], sort_order: 27, is_menu: false },
  { id: "baoma-wings-korean-style", restaurant_id: "baoma-demo", name: "Wings Korean Style", description: "4 pièces : 6.00€ · 6 pièces : 8.00€ · sauce coréenne épicée, sésame", price: 6, category: "Wings", emoji: "🍽️", photo_url: "/menu/wings-korean-style.jpg", is_popular: false, available: true, stock: null, supplements: [], extras: [], sort_order: 28, is_menu: false },
  { id: "baoma-wings-moutarde-miel", restaurant_id: "baoma-demo", name: "Wings Moutarde Miel", description: "4 pièces : 6.00€ · 6 pièces : 8.00€ · sauce miel moutarde, sésame", price: 6, category: "Wings", emoji: "🍽️", photo_url: "/menu/wings-korean-moutarde-miel.jpg", is_popular: false, available: true, stock: null, supplements: [], extras: [], sort_order: 29, is_menu: false },
  { id: "baoma-wings-parmesan", restaurant_id: "baoma-demo", name: "Wings Parmesan", description: "4 pièces : 6.00€ · 6 pièces : 8.00€ · parmesan, ail, persil", price: 6, category: "Wings", emoji: "🍽️", photo_url: "/menu/wings-parmesan.jpg", is_popular: false, available: true, stock: null, supplements: [], extras: [], sort_order: 30, is_menu: false },
  { id: "baoma-wings-classic-style", restaurant_id: "baoma-demo", name: "Wings Classic Style", description: "4 pièces : 6.00€ · 6 pièces : 8.00€ · recette classique, sésame", price: 6, category: "Wings", emoji: "🍽️", photo_url: "/menu/wings-classic-style.jpg", is_popular: false, available: true, stock: null, supplements: [], extras: [], sort_order: 31, is_menu: false },
  { id: "baoma-frites-maison", restaurant_id: "baoma-demo", name: "Frites Maison", description: "Seules : 3.00€", price: 3, category: "Sides", emoji: "🍽️", photo_url: "/menu/frites-maison.jpg", is_popular: false, available: true, stock: null, supplements: [], extras: [], sort_order: 31, is_menu: false },
  { id: "baoma-frites-paprika", restaurant_id: "baoma-demo", name: "Frites Paprika", description: "Seules : 3.50€ · avec Bao burger : +1.20€", price: 3.5, category: "Sides", emoji: "🍽️", photo_url: "/menu/frites-paprika.jpg", is_popular: false, available: true, stock: null, supplements: [], extras: [], sort_order: 32, is_menu: false },
  { id: "baoma-frites-patate-douce", restaurant_id: "baoma-demo", name: "Frites de Patate Douce", description: "Seules : 4.00€ · avec Bao burger : +1.60€", price: 4, category: "Sides", emoji: "🍽️", photo_url: "/menu/frites-patate-douce.jpg", is_popular: false, available: true, stock: null, supplements: [], extras: [], sort_order: 33, is_menu: false },
  { id: "baoma-frites-cheddar-maison", restaurant_id: "baoma-demo", name: "Frites Cheddar Maison", description: "Seules : 4.50€ · avec Bao burger : +1.50€", price: 4.5, category: "Sides", emoji: "🍽️", photo_url: "/menu/frites-cheddar-maison.jpg", is_popular: false, available: true, stock: null, supplements: [], extras: [], sort_order: 34, is_menu: false },
  { id: "baoma-frites-bacon-cheddar", restaurant_id: "baoma-demo", name: "Frites Bacon Cheddar", description: "Seules : 5.50€ · avec Bao burger : +3.00€", price: 5.5, category: "Sides", emoji: "🍽️", photo_url: "/menu/frites-bacon-cheddar.jpg", is_popular: false, available: true, stock: null, supplements: [], extras: [], sort_order: 35, is_menu: false },
  { id: "baoma-cheesecake-fruits-rouges", restaurant_id: "baoma-demo", name: "Cheesecake Fruits Rouges", description: "Cheesecake new-yorkais, coulis de fruits rouges", price: 6.9, category: "Desserts", emoji: "🍽️", photo_url: "/menu/cheesecake-fruits-rouges.jpg", is_popular: false, available: true, stock: null, supplements: [], extras: [], sort_order: 36, is_menu: false },
  { id: "baoma-cheesecake-mangue", restaurant_id: "baoma-demo", name: "Cheesecake Mangue", description: "Cheesecake new-yorkais, coulis de mangue", price: 6.9, category: "Desserts", emoji: "🍽️", photo_url: "/menu/cheesecake-mangue.jpg", is_popular: false, available: true, stock: null, supplements: [], extras: [], sort_order: 37, is_menu: false },
  { id: "baoma-cheesecake-caramel", restaurant_id: "baoma-demo", name: "Cheesecake Caramel", description: "Cheesecake new-yorkais, caramel, éclats de noisettes", price: 6.9, category: "Desserts", emoji: "🍽️", photo_url: "/menu/cheesecake-caramel.jpg", is_popular: false, available: true, stock: null, supplements: [], extras: [], sort_order: 38, is_menu: false },
  { id: "baoma-brioche-perdue-caramel", restaurant_id: "baoma-demo", name: "Brioche Perdue Caramel", description: "Brioche perdue, glace vanille, caramel, éclats de noisettes", price: 8.9, category: "Desserts", emoji: "🍽️", photo_url: "/menu/brioche-perdue-caramel.jpg", is_popular: false, available: true, stock: null, supplements: [], extras: [], sort_order: 39, is_menu: false },
  { id: "baoma-brioche-perdue-chocolat", restaurant_id: "baoma-demo", name: "Brioche Perdue Chocolat", description: "Brioche perdue, chantilly, chocolat, fruits rouges", price: 8.9, category: "Desserts", emoji: "🍽️", photo_url: "/menu/brioche-perdue-chocolat.jpg", is_popular: false, available: true, stock: null, supplements: [], extras: [], sort_order: 40, is_menu: false },
  { id: "baoma-churros", restaurant_id: "baoma-demo", name: "Churros", description: "Churros maison, sucre cannelle, sauce chocolat", price: 4.9, category: "Desserts", emoji: "🍽️", photo_url: "/menu/churros.jpg", is_popular: false, available: true, stock: null, supplements: [], extras: [], sort_order: 41, is_menu: false },
  { id: "baoma-mojito-violette", restaurant_id: "baoma-demo", name: "Mojito Violette", description: "Citron vert, menthe fraîche, sirop de violette", price: 5.5, category: "Mojitos & Boissons", emoji: "🍽️", photo_url: "/menu/mojito-violette.jpg", is_popular: false, available: true, stock: null, supplements: [], extras: [], sort_order: 42, is_menu: false },
  { id: "baoma-mojito-passion", restaurant_id: "baoma-demo", name: "Mojito Passion", description: "Citron vert, menthe fraîche, fruit de la passion", price: 5.5, category: "Mojitos & Boissons", emoji: "🍽️", photo_url: "/menu/mojito-passion.jpg", is_popular: false, available: true, stock: null, supplements: [], extras: [], sort_order: 43, is_menu: false },
  { id: "baoma-mojito-cerise", restaurant_id: "baoma-demo", name: "Mojito Cerise", description: "Citron vert, menthe fraîche, sirop de cerise", price: 5.5, category: "Mojitos & Boissons", emoji: "🍽️", photo_url: "/menu/mojito-cerise.jpg", is_popular: false, available: true, stock: null, supplements: [], extras: [], sort_order: 44, is_menu: false },
  { id: "baoma-mojito-kiwi", restaurant_id: "baoma-demo", name: "Mojito Kiwi", description: "Citron vert, menthe fraîche, kiwi", price: 5.5, category: "Mojitos & Boissons", emoji: "🍽️", photo_url: "/menu/mojito-kiwi.jpg", is_popular: false, available: true, stock: null, supplements: [], extras: [], sort_order: 45, is_menu: false },
  { id: "baoma-mojito-classique", restaurant_id: "baoma-demo", name: "Mojito Classique", description: "Citron vert, menthe fraîche, sucre de canne", price: 5.5, category: "Mojitos & Boissons", emoji: "🍽️", photo_url: "/menu/mojito-classique.jpg", is_popular: false, available: true, stock: null, supplements: [], extras: [], sort_order: 46, is_menu: false },
  { id: "baoma-the-glace", restaurant_id: "baoma-demo", name: "Thé Glacé Maison", description: "Thé glacé maison, menthe fraîche", price: 5.5, category: "Mojitos & Boissons", emoji: "🍽️", photo_url: "/menu/the-glace.jpg", is_popular: false, available: true, stock: null, supplements: [], extras: [], sort_order: 47, is_menu: false },
  { id: "baoma-menu-midi", restaurant_id: "baoma-demo", name: "Menu Midi", description: "Burger + frites — formule valable de 12h à 15h, du lundi au vendredi · Au choix : Végé, Fried Chicken, Cheese Burger, Smash Bao, Chicken Thaï · Boisson au choix : +1.50€ · Cocktail au choix : +3.50€", price: 15.9, category: "Formules", emoji: "🍽️", photo_url: "/menu/menu-midi.jpg", is_popular: true, available: true, stock: null, supplements: [], extras: [], sort_order: 48, is_menu: true },
  { id: "baoma-menu-enfant", restaurant_id: "baoma-demo", name: "Menu Enfant", description: "Burger enfant : ketchup, steak, cheddar · Frites · Boisson", price: 9.9, category: "Formules", emoji: "🍽️", photo_url: "/menu/menu-enfant.jpg", is_popular: true, available: true, stock: null, supplements: [], extras: [], sort_order: 49, is_menu: true },
];

export const BAOMA_MENU = BAOMA_MENU_BASE.map((it) => ({ ...it, supplements: baomaOptionsFor(it) || it.supplements }));

export const BAOMA_RESTAURANT = {
  id: "baoma-demo", name: "Baoma", address: "", logo_emoji: "🐼",
  tables_count: 12, slug: BAOMA_SLUG, owner_id: "demo",
};
