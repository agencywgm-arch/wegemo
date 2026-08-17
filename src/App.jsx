import { useState, useEffect, useRef, useCallback, createContext, useContext } from "react";
import QRCode from "qrcode";
import { supabase, hasSupabase, callFunction } from "./lib/supabase.js";
import { BAOMA_SLUG, BAOMA_THEME, BAOMA_CATEGORIES, BAOMA_MENU, BAOMA_RESTAURANT } from "./baomaData.js";

// Restaurants qui utilisent le design premium Baoma (photos, tilt 3D, etc.)
// avec leur propre carte réelle — pas seulement le restaurant de démo.
const BAOMA_THEME_SLUGS = [BAOMA_SLUG, "baoma-xuf"];

/* ============================================================================
 * THEME
 * ==========================================================================*/
const C = {
  bg: "#F5F5F7", surface: "#FFFFFF", surfaceAlt: "#FAFAFA",
  border: "rgba(0,0,0,0.08)", borderStrong: "rgba(0,0,0,0.14)",
  text: "#1D1D1F", textSecondary: "#6E6E73", textTertiary: "#AEAEB2",
  accent: "#FF375F", accentBlue: "#0071E3", accentGreen: "#34C759",
  accentOrange: "#FF9F0A", accentPurple: "#BF5AF2",
  dark: "#1D1D1F", white: "#FFFFFF",
};
const FF = { fontFamily: "'Figtree', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" };

/* ============================================================================
 * LANGUAGES + TRANSLATIONS
 * ==========================================================================*/
const LANG_OPTIONS = [
  { code: "fr", flag: "🇫🇷", name: "Français" },
  { code: "en", flag: "🇬🇧", name: "English" },
  { code: "es", flag: "🇪🇸", name: "Español" },
  { code: "pt", flag: "🇵🇹", name: "Português" },
];

const CUSTOMER_LANGS = [
  { code: "fr", flag: "🇫🇷", name: "Français" },
  { code: "en", flag: "🇬🇧", name: "English" },
  { code: "ar", flag: "🇸🇦", name: "العربية" },
  { code: "es", flag: "🇪🇸", name: "Español" },
  { code: "pt", flag: "🇵🇹", name: "Português" },
];

const CT = {
  fr: {
    orderTypeTitle: "Comment souhaitez-vous commander ?", orderTypeConfirm: "Continuer",
    dineIn: "Sur place", dineInSub: "Je mange au restaurant",
    takeaway: "À emporter", takeawaySub: "Je récupère ma commande",
    all: "Tous", back: "Retour", search: "Rechercher un plat…",
    cart: "Panier", emptyCart: "Votre panier est vide", addToCart: "Ajouter",
    total: "Total", promoCode: "Code promo", apply: "Appliquer", discount: "Réduction",
    checkout: "Commander", payCash: "Payer en espèces", payCard: "Payer par carte",
    yourName: "Votre nom", yourEmail: "Votre email", skip: "Passer", confirm: "Confirmer",
    orderConfirmed: "Commande confirmée !", orderTracking: "Suivi de commande",
    rateOrder: "Notez votre expérience", leaveGoogleReview: "Laisser un avis Google",
    popular: "Populaire", supplements: "Suppléments", extras: "Garnitures", askAI: "Poser une question",
  },
  en: {
    orderTypeTitle: "How would you like to order?", orderTypeConfirm: "Continue",
    dineIn: "Dine in", dineInSub: "I'm eating at the restaurant",
    takeaway: "Takeaway", takeawaySub: "I'm picking up my order",
    all: "All", back: "Back", search: "Search a dish…",
    cart: "Cart", emptyCart: "Your cart is empty", addToCart: "Add",
    total: "Total", promoCode: "Promo code", apply: "Apply", discount: "Discount",
    checkout: "Order", payCash: "Pay with cash", payCard: "Pay by card",
    yourName: "Your name", yourEmail: "Your email", skip: "Skip", confirm: "Confirm",
    orderConfirmed: "Order confirmed!", orderTracking: "Order tracking",
    rateOrder: "Rate your experience", leaveGoogleReview: "Leave a Google review",
    popular: "Popular", supplements: "Add-ons", extras: "Sides", askAI: "Ask a question",
  },
  ar: {
    orderTypeTitle: "كيف ترغب في الطلب؟", orderTypeConfirm: "متابعة",
    dineIn: "في المطعم", dineInSub: "سآكل في المطعم",
    takeaway: "للأخذ", takeawaySub: "سأستلم طلبي",
    all: "الكل", back: "رجوع", search: "ابحث عن طبق…",
    cart: "السلة", emptyCart: "سلتك فارغة", addToCart: "أضف",
    total: "المجموع", promoCode: "رمز ترويجي", apply: "تطبيق", discount: "خصم",
    checkout: "اطلب", payCash: "الدفع نقداً", payCard: "الدفع بالبطاقة",
    yourName: "اسمك", yourEmail: "بريدك الإلكتروني", skip: "تخطي", confirm: "تأكيد",
    orderConfirmed: "تم تأكيد الطلب!", orderTracking: "تتبع الطلب",
    rateOrder: "قيّم تجربتك", leaveGoogleReview: "اترك تقييماً على جوجل",
    popular: "شائع", supplements: "إضافات", extras: "أطباق جانبية", askAI: "اطرح سؤالاً",
  },
  es: {
    orderTypeTitle: "¿Cómo desea pedir?", orderTypeConfirm: "Continuar",
    dineIn: "En el local", dineInSub: "Como en el restaurante",
    takeaway: "Para llevar", takeawaySub: "Recojo mi pedido",
    all: "Todos", back: "Volver", search: "Buscar un plato…",
    cart: "Carrito", emptyCart: "Tu carrito está vacío", addToCart: "Añadir",
    total: "Total", promoCode: "Código promo", apply: "Aplicar", discount: "Descuento",
    checkout: "Pedir", payCash: "Pagar en efectivo", payCard: "Pagar con tarjeta",
    yourName: "Tu nombre", yourEmail: "Tu correo", skip: "Omitir", confirm: "Confirmar",
    orderConfirmed: "¡Pedido confirmado!", orderTracking: "Seguimiento del pedido",
    rateOrder: "Califica tu experiencia", leaveGoogleReview: "Dejar una reseña en Google",
    popular: "Popular", supplements: "Extras", extras: "Guarniciones", askAI: "Hacer una pregunta",
  },
  pt: {
    orderTypeTitle: "Como deseja pedir?", orderTypeConfirm: "Continuar",
    dineIn: "No local", dineInSub: "Vou comer no restaurante",
    takeaway: "Para levar", takeawaySub: "Vou buscar o meu pedido",
    all: "Todos", back: "Voltar", search: "Procurar um prato…",
    cart: "Carrinho", emptyCart: "O seu carrinho está vazio", addToCart: "Adicionar",
    total: "Total", promoCode: "Código promo", apply: "Aplicar", discount: "Desconto",
    checkout: "Pedir", payCash: "Pagar em dinheiro", payCard: "Pagar com cartão",
    yourName: "O seu nome", yourEmail: "O seu email", skip: "Ignorar", confirm: "Confirmar",
    orderConfirmed: "Pedido confirmado!", orderTracking: "Acompanhamento do pedido",
    rateOrder: "Avalie a sua experiência", leaveGoogleReview: "Deixar uma avaliação Google",
    popular: "Popular", supplements: "Adicionais", extras: "Acompanhamentos", askAI: "Fazer uma pergunta",
  },
};
const t = (lang, key) => (CT[lang] && CT[lang][key]) || CT.fr[key] || key;

/* ============================================================================
 * SEASONAL EVENTS (marketing calendar) — abbreviated set
 * ==========================================================================*/
const SEASONAL_EVENTS = [
  { id: "newyear", name: "Nouvel An", date: "01-01", emoji: "🎉", color: "#BF5AF2", idea: "Menu festif + coupe de champagne offerte" },
  { id: "epiphany", name: "Épiphanie", date: "01-06", emoji: "👑", color: "#FF9F0A", idea: "Galette des rois à partager" },
  { id: "valentine", name: "Saint-Valentin", date: "02-14", emoji: "❤️", color: "#FF375F", idea: "Menu duo romantique aux chandelles" },
  { id: "carnival", name: "Carnaval", date: "02-20", emoji: "🎭", color: "#BF5AF2", idea: "Beignets et ambiance déguisée" },
  { id: "intlwomen", name: "Journée des droits des femmes", date: "03-08", emoji: "🌸", color: "#FF375F", idea: "Cocktail offert aux clientes" },
  { id: "stpatrick", name: "Saint-Patrick", date: "03-17", emoji: "🍀", color: "#34C759", idea: "Bière verte & spécialités irlandaises" },
  { id: "spring", name: "Printemps", date: "03-20", emoji: "🌷", color: "#34C759", idea: "Carte de saison aux légumes nouveaux" },
  { id: "easter", name: "Pâques", date: "04-09", emoji: "🐰", color: "#FF9F0A", idea: "Brunch de Pâques en famille" },
  { id: "labour", name: "Fête du Travail", date: "05-01", emoji: "🌼", color: "#34C759", idea: "Brin de muguet offert" },
  { id: "victory", name: "8 Mai", date: "05-08", emoji: "🕊️", color: "#0071E3", idea: "Menu du terroir" },
  { id: "mothers", name: "Fête des Mères", date: "05-28", emoji: "💐", color: "#FF375F", idea: "Dessert offert à toutes les mamans" },
  { id: "fathers", name: "Fête des Pères", date: "06-18", emoji: "👔", color: "#0071E3", idea: "Planche apéro + bière pour papa" },
  { id: "rolandgarros", name: "Roland-Garros", date: "06-05", emoji: "🎾", color: "#FF9F0A", idea: "Écran géant + menu tennis" },
  { id: "summer", name: "Été", date: "06-21", emoji: "☀️", color: "#FF9F0A", idea: "Carte estivale & terrasse" },
  { id: "music", name: "Fête de la Musique", date: "06-21", emoji: "🎶", color: "#BF5AF2", idea: "Concert live + happy hour" },
  { id: "tourdefrance", name: "Tour de France", date: "07-01", emoji: "🚴", color: "#FF9F0A", idea: "Étapes diffusées + menu régional" },
  { id: "bastille", name: "14 Juillet", date: "07-14", emoji: "🎆", color: "#0071E3", idea: "Menu tricolore & feu d'artifice" },
  { id: "worldcup", name: "Coupe du Monde", date: "07-15", emoji: "⚽", color: "#34C759", idea: "Diffusion des matchs + formule supporter" },
  { id: "assumption", name: "15 Août", date: "08-15", emoji: "🌊", color: "#0071E3", idea: "Formule estivale en terrasse" },
  { id: "backtoschool", name: "Rentrée", date: "09-01", emoji: "🎒", color: "#FF9F0A", idea: "Formule déjeuner express" },
  { id: "autumn", name: "Automne", date: "09-22", emoji: "🍂", color: "#FF9F0A", idea: "Plats mijotés & champignons" },
  { id: "halloween", name: "Halloween", date: "10-31", emoji: "🎃", color: "#FF9F0A", idea: "Cocktails effrayants & déco" },
  { id: "armistice", name: "11 Novembre", date: "11-11", emoji: "🌺", color: "#0071E3", idea: "Plat du jour commémoratif" },
  { id: "beaujolais", name: "Beaujolais Nouveau", date: "11-21", emoji: "🍷", color: "#BF5AF2", idea: "Dégustation du Beaujolais nouveau" },
  { id: "blackfriday", name: "Black Friday", date: "11-29", emoji: "🛍️", color: "#1D1D1F", idea: "-30% sur les cartes cadeaux" },
  { id: "stnicolas", name: "Saint-Nicolas", date: "12-06", emoji: "🎅", color: "#FF375F", idea: "Chocolat chaud offert aux enfants" },
  { id: "christmas", name: "Noël", date: "12-25", emoji: "🎄", color: "#FF375F", idea: "Menu de fêtes & bûche maison" },
  { id: "nye", name: "Réveillon", date: "12-31", emoji: "🥂", color: "#BF5AF2", idea: "Soirée du Nouvel An avec DJ" },
];

/* ============================================================================
 * DEMO DATA (fully offline mode)
 * ==========================================================================*/
const DEMO_RESTAURANT = {
  id: "demo", name: "Le Bistrot Démo", address: "12 rue de la Démo, Paris",
  logo_emoji: "🍽️", tables_count: 8, slug: "demo", owner_id: "demo",
};
const DEMO_MENU = [
  { id: "m1", restaurant_id: "demo", name: "Burger Maison", description: "Bœuf, cheddar, oignons confits", price: 14.5, category: "Plats", emoji: "🍔", is_popular: true, available: true, stock: null, supplements: [{ name: "Bacon", price: 1.5 }, { name: "Œuf", price: 1 }], extras: [] },
  { id: "m2", restaurant_id: "demo", name: "Salade César", description: "Poulet, parmesan, croûtons", price: 12, category: "Entrées", emoji: "🥗", is_popular: false, available: true, stock: null, supplements: [], extras: [] },
  { id: "m3", restaurant_id: "demo", name: "Pizza Margherita", description: "Tomate, mozzarella, basilic", price: 11, category: "Plats", emoji: "🍕", is_popular: true, available: true, stock: null, supplements: [], extras: [] },
  { id: "m4", restaurant_id: "demo", name: "Tiramisu", description: "Recette traditionnelle", price: 6.5, category: "Desserts", emoji: "🍰", is_popular: false, available: true, stock: 5, supplements: [], extras: [] },
  { id: "m5", restaurant_id: "demo", name: "Limonade Maison", description: "Citron pressé, menthe", price: 4, category: "Boissons", emoji: "🍋", is_popular: false, available: true, stock: null, supplements: [], extras: [] },
  { id: "m6", restaurant_id: "demo", name: "Frites Maison", description: "Pommes de terre fraîches", price: 4.5, category: "Accompagnements", emoji: "🍟", is_popular: true, available: true, stock: null, supplements: [], extras: [] },
];
const minsAgo = (m) => new Date(Date.now() - m * 60000).toISOString();
const DEMO_ORDERS = [
  { id: "o1", restaurant_id: "demo", table_id: "t3", status: "PENDING", note: "Sans oignons", total: 19, payment_method: "card", customer_name: "Léa", order_type: "dine_in", cash_collected: false, created_at: minsAgo(3), table: { number: 3 }, items: [{ name: "Burger Maison", emoji: "🍔", quantity: 1 }, { name: "Frites Maison", emoji: "🍟", quantity: 1 }] },
  { id: "o2", restaurant_id: "demo", table_id: "t1", status: "PREPARING", note: "", total: 11, payment_method: "cash", customer_name: "Tom", order_type: "takeaway", cash_collected: false, created_at: minsAgo(8), table: { number: 1 }, items: [{ name: "Pizza Margherita", emoji: "🍕", quantity: 1 }] },
  { id: "o3", restaurant_id: "demo", table_id: "t5", status: "READY", note: "", total: 16, payment_method: "card", customer_name: "Sarah", order_type: "dine_in", cash_collected: false, created_at: minsAgo(12), table: { number: 5 }, items: [{ name: "Salade César", emoji: "🥗", quantity: 1 }, { name: "Limonade Maison", emoji: "🍋", quantity: 1 }] },
];
const DEMO_DONE_ORDERS = [
  { id: "d1", restaurant_id: "demo", status: "DONE", total: 28, payment_method: "card", created_at: minsAgo(60), table: { number: 2 } },
  { id: "d2", restaurant_id: "demo", status: "DONE", total: 15.5, payment_method: "cash", cash_collected: true, created_at: minsAgo(120), table: { number: 4 } },
];
const DEMO_INGREDIENTS = [
  { id: "i1", restaurant_id: "demo", name: "Pain burger", unit: "pcs", emoji: "🍞", stock: 24, alert_threshold: 10 },
  { id: "i2", restaurant_id: "demo", name: "Steak haché", unit: "pcs", emoji: "🥩", stock: 8, alert_threshold: 12 },
  { id: "i3", restaurant_id: "demo", name: "Mozzarella", unit: "kg", emoji: "🧀", stock: 3.2, alert_threshold: 2 },
  { id: "i4", restaurant_id: "demo", name: "Tomates", unit: "kg", emoji: "🍅", stock: 1.1, alert_threshold: 3 },
];
const DEMO_PROMOS = [
  { id: "p1", restaurant_id: "demo", name: "Happy Hour", description: "-20% sur les boissons 17h-19h", discount_percent: 20, emoji: "🍹", color: "#FF9F0A", type: "happy_hour", active: true, send_count: 2 },
  { id: "p2", restaurant_id: "demo", name: "Menu Saint-Valentin", description: "Menu duo à 49€", discount_percent: 0, emoji: "❤️", color: "#FF375F", type: "seasonal", active: true, send_count: 0 },
];
const DEMO_CUSTOMERS = [
  { id: "c1", restaurant_id: "demo", email: "lea@example.com", first_name: "Léa", phone: "0600000001", first_visit: "2025-01-10", last_visit: "2026-06-15", order_count: 7, total_spent: 142.5 },
  { id: "c2", restaurant_id: "demo", email: "tom@example.com", first_name: "Tom", phone: "", first_visit: "2026-03-01", last_visit: "2026-06-19", order_count: 2, total_spent: 28 },
  { id: "c3", restaurant_id: "demo", email: "sarah@example.com", first_name: "Sarah", phone: "0600000003", first_visit: "2024-11-20", last_visit: "2026-04-02", order_count: 12, total_spent: 318 },
];
const DEMO_RECIPES = { m1: { i1: 1, i2: 1 }, m3: { i3: 0.15, i4: 0.2 } };
const DEMO_GROUP = { id: "demo-group", name: "Groupe Démo", logo_emoji: "🏢", plan: "group" };
const DEMO_FRANCHISE_RESTAURANTS = [
  { id: "demo", name: "Bistrot Paris", region: "Île-de-France", revenue_today: 1240, orders_today: 86, avg_basket: 14.4, growth: 12 },
  { id: "fr2", name: "Bistrot Lyon", region: "Rhône", revenue_today: 980, orders_today: 71, avg_basket: 13.8, growth: -4 },
  { id: "fr3", name: "Bistrot Marseille", region: "PACA", revenue_today: 1530, orders_today: 102, avg_basket: 15.0, growth: 23 },
];
const DEMO_FRANCHISE_STATS = { revenue_today: 3750, orders_today: 259, avg_basket: 14.5, customers: 1820 };
const DEMO_REVIEWS = [
  { id: "rv1", rating: 5, comment: "Excellent burger !", created_at: minsAgo(200) },
  { id: "rv2", rating: 4, comment: "Service rapide", created_at: minsAgo(900) },
];

/* ---- HOTEL vertical demo data ---- */
const DEMO_HOTEL = {
  id: "demo-hotel", name: "Hôtel Démo", address: "5 avenue des Rêves, Paris",
  logo_emoji: "🏨", tables_count: 12, slug: "demo-hotel", owner_id: "demo", vertical: "hotel",
};
const DEMO_HOTEL_MENU = [
  { id: "h1", restaurant_id: "demo-hotel", name: "Club Sandwich", description: "Poulet, bacon, œuf, frites", price: 18, category: "Plats", emoji: "🥪", is_popular: true, available: true, stock: null, supplements: [{ name: "Extra frites", price: 4 }], extras: [] },
  { id: "h2", restaurant_id: "demo-hotel", name: "Burger Signature", description: "Bœuf Angus, cheddar affiné", price: 24, category: "Plats", emoji: "🍔", is_popular: true, available: true, stock: null, supplements: [], extras: [] },
  { id: "h3", restaurant_id: "demo-hotel", name: "Petit-déjeuner continental", description: "Viennoiseries, jus, boisson chaude", price: 22, category: "Petit-déjeuner", emoji: "🥐", is_popular: false, available: true, stock: null, supplements: [], extras: [] },
  { id: "h4", restaurant_id: "demo-hotel", name: "Plateau de fruits frais", description: "Sélection de saison", price: 14, category: "En-cas", emoji: "🍓", is_popular: false, available: true, stock: null, supplements: [], extras: [] },
  { id: "h5", restaurant_id: "demo-hotel", name: "Bouteille de Champagne", description: "Brut, 75cl", price: 65, category: "Boissons", emoji: "🍾", is_popular: false, available: true, stock: 6, supplements: [], extras: [] },
  { id: "h6", restaurant_id: "demo-hotel", name: "Café / Thé", description: "Sélection premium", price: 6, category: "Boissons", emoji: "☕", is_popular: true, available: true, stock: null, supplements: [], extras: [] },
];
// Real hotel room numbers, by floor (rooms replace tables in the hotel vertical).
const DEMO_HOTEL_ROOMS = [101, 102, 103, 104, 201, 202, 203, 204, 301, 302, 303, 304];
const DEMO_HOTEL_ORDERS = [
  { id: "ho1", restaurant_id: "demo-hotel", table_id: "r204", status: "PENDING", note: "Sans gluten", total: 30, payment_method: "room", customer_name: "Ch. 204", order_type: "room_service", cash_collected: false, created_at: minsAgo(4), table: { number: 204 }, items: [{ name: "Club Sandwich", emoji: "🥪", quantity: 1 }, { name: "Café / Thé", emoji: "☕", quantity: 2 }] },
  { id: "ho2", restaurant_id: "demo-hotel", table_id: "r302", status: "PREPARING", note: "", total: 65, payment_method: "room", customer_name: "Ch. 302", order_type: "room_service", cash_collected: false, created_at: minsAgo(9), table: { number: 302 }, items: [{ name: "Bouteille de Champagne", emoji: "🍾", quantity: 1 }] },
  { id: "ho3", restaurant_id: "demo-hotel", table_id: "r103", status: "READY", note: "Livraison 8h", total: 22, payment_method: "room", customer_name: "Ch. 103", order_type: "room_service", cash_collected: false, created_at: minsAgo(15), table: { number: 103 }, items: [{ name: "Petit-déjeuner continental", emoji: "🥐", quantity: 1 }] },
];
const DEMO_HOTEL_DONE = [
  { id: "hd1", restaurant_id: "demo-hotel", status: "DONE", total: 42, payment_method: "room", created_at: minsAgo(90), table: { number: 301 } },
  { id: "hd2", restaurant_id: "demo-hotel", status: "DONE", total: 18, payment_method: "card", created_at: minsAgo(180), table: { number: 202 } },
];
const DEMO_CHECKINS = [
  { id: "ck1", restaurant_id: "demo-hotel", guest_name: "Léa Martin", email: "lea@example.com", room: 204, guests: 2, checkin_date: "2026-07-16", checkout_date: "2026-07-19", status: "in_house" },
  { id: "ck2", restaurant_id: "demo-hotel", guest_name: "Tom Bernard", email: "", room: 103, guests: 1, checkin_date: "2026-07-16", checkout_date: "2026-07-17", status: "arriving" },
  { id: "ck3", restaurant_id: "demo-hotel", guest_name: "Sarah Cohen", email: "sarah@example.com", room: 301, guests: 2, checkin_date: "2026-07-12", checkout_date: "2026-07-16", status: "departing" },
];

/* Guest-portal content (what a guest sees after scanning the room QR). */
const HOTEL_SERVICES = [
  { id: "spa", emoji: "🧖", name: "Spa & Massage", desc: "Massage 60 min en cabine ou en chambre", price: 90, cta: "Réserver un créneau" },
  { id: "pool", emoji: "🏊", name: "Piscine & Sauna", desc: "Accès inclus · 7h – 22h", price: 0, cta: "Voir les horaires" },
  { id: "pressing", emoji: "👔", name: "Pressing", desc: "Déposé avant 9h, rendu le soir même", price: 15, cta: "Demander un retrait" },
  { id: "menage", emoji: "🧹", name: "Ménage supplémentaire", desc: "Passage de l'équipe dans l'heure", price: 0, cta: "Demander" },
  { id: "serviettes", emoji: "🛁", name: "Serviettes & oreillers", desc: "Livrés à votre porte", price: 0, cta: "Demander" },
  { id: "reveil", emoji: "⏰", name: "Réveil téléphonique", desc: "Choisissez votre horaire", price: 0, cta: "Programmer" },
  { id: "taxi", emoji: "🚕", name: "Taxi / Transfert", desc: "Réservation par la réception", price: 0, cta: "Commander un taxi" },
  { id: "late", emoji: "🕐", name: "Late check-out", desc: "Départ jusqu'à 15h (selon dispo)", price: 25, cta: "Demander" },
];
const HOTEL_EVENTS = [
  { id: "ev1", emoji: "🎷", title: "Jazz au Caveau", when: "Ce soir · 20h30", dist: "400 m", tag: "Concert", desc: "Quartet live, entrée libre pour nos clients." },
  { id: "ev2", emoji: "🖼️", title: "Expo Monet — Musée d'Orsay", when: "Jusqu'au 30 juil.", dist: "1,2 km", tag: "Expo", desc: "Coupe-file offert sur présentation de la clé." },
  { id: "ev3", emoji: "🥐", title: "Marché couvert Saint-Germain", when: "Demain · 8h – 13h", dist: "600 m", tag: "Marché", desc: "Producteurs locaux, idéal pour un brunch." },
  { id: "ev4", emoji: "🍷", title: "La Cave d'Auguste — partenaire", when: "Tous les jours", dist: "250 m", tag: "-10%", desc: "10% pour les clients de l'hôtel sur le menu dégustation." },
  { id: "ev5", emoji: "🚲", title: "Balade guidée à vélo", when: "Sam. · 10h", dist: "Départ hall", tag: "Activité", desc: "2h le long de la Seine, casques fournis — 18€." },
];
const HOTEL_INFO = [
  { emoji: "📶", label: "Wi-Fi", value: "Réseau « HotelDemo » · code SEJOUR2026" },
  { emoji: "🥐", label: "Petit-déjeuner", value: "7h – 10h30 · Salle Verrière (RDC) · en chambre +8€ de service" },
  { emoji: "🕛", label: "Check-out", value: "Jusqu'à 12h · late check-out sur demande" },
  { emoji: "☎️", label: "Réception", value: "24h/24 · composez le 9 depuis la chambre" },
  { emoji: "🅿️", label: "Parking", value: "Souterrain · 28€/nuit · hauteur max 1,90 m" },
  { emoji: "🏋️", label: "Salle de sport", value: "Niveau -1 · 6h – 23h · accès avec la clé" },
];
const ID_TYPES = ["Carte d'identité", "Passeport", "Permis de conduire", "Titre de séjour"];

/* Breakfast — buffet info + in-room delivery (tray service charge). */
const BREAKFAST_FORMULAS = [
  { id: "continental", emoji: "🥐", name: "Continental", price: 22, desc: "Viennoiseries, pain frais, confitures, jus pressé, boisson chaude" },
  { id: "gourmand", emoji: "🍳", name: "Gourmand", price: 28, desc: "Continental + œufs au choix, saumon fumé, fruits frais" },
  { id: "healthy", emoji: "🥣", name: "Healthy", price: 24, desc: "Granola, yaourt grec, fruits de saison, avocado toast, jus détox" },
];
const BREAKFAST_SLOTS = ["7h00 – 7h30", "7h30 – 8h00", "8h00 – 8h30", "8h30 – 9h00", "9h00 – 9h30", "9h30 – 10h00", "10h00 – 10h30"];
const TRAY_CHARGE = 8; // service en chambre, par plateau

/* Vertical config — Wegemo (restaurant) vs Wegemo Hôtel. Same tooling, adapted
 * wording, demo dataset and extra tabs. */
const VERTICALS = {
  resto: {
    id: "resto", name: "Wegemo", switchLabel: "🍽️ Restaurant", accent: C.accent,
    hero: "Le restaurant, réinventé par le QR code.",
    sub: "Vos clients scannent, commandent et paient. Vous gérez tout depuis un seul tableau de bord.",
    features: ["Commande par QR code", "Cuisine en temps réel", "Paiement Stripe intégré", "CRM & campagnes email", "Support 7j/7"],
    demo: DEMO_RESTAURANT, unit: "Table", tabLabels: {}, extraTabs: [],
  },
  hotel: {
    id: "hotel", name: "Wegemo Hôtel", switchLabel: "🏨 Hôtel", accent: C.accentBlue,
    hero: "L'hôtel, réinventé par le QR code.",
    sub: "Vos clients commandent leur room service et gèrent leur check-in depuis la chambre. Vous pilotez tout depuis un seul tableau de bord.",
    features: ["Room service par QR code", "Check-in interne", "Facturation sur la chambre", "CRM clients", "Support 7j/7"],
    demo: DEMO_HOTEL, unit: "Chambre",
    tabLabels: { overview: "Vue d'ensemble", orders: "Room service", menu: "Carte room service", qr: "QR Chambres", register: "Facturation" },
    extraTabs: [{ id: "checkin", label: "Check-in", icon: "🛎️", module: "base", afterId: "orders" }],
  },
};
const verticalOf = (id) => VERTICALS[id] || VERTICALS.resto;

/* ============================================================================
 * SMALL HELPERS
 * ==========================================================================*/
const eur = (n) => `${Number(n || 0).toFixed(2)} €`;
const uid = () => (crypto?.randomUUID ? crypto.randomUUID() : `id-${Math.random().toString(36).slice(2)}`);
const slugify = (s) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") ||
  `r-${Math.random().toString(36).slice(2, 7)}`;

function useIsMobile() {
  const [m, setM] = useState(typeof window !== "undefined" ? window.innerWidth < 768 : false);
  useEffect(() => {
    const on = () => setM(window.innerWidth < 768);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return m;
}

function useOnboarding(demoMode) {
  const key = demoMode ? "wgm_onboarding_demo" : "wgm_onboarding";
  const [steps, setSteps] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(key) || "{}");
    } catch {
      return {};
    }
  });
  const complete = useCallback(
    (step) =>
      setSteps((prev) => {
        const next = { ...prev, [step]: true };
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch { /* ignore */ }
        return next;
      }),
    [key],
  );
  return { steps, complete };
}

/* ============================================================================
 * AUTH
 * ==========================================================================*/
const AuthContext = createContext(null);
const useAuth = () => useContext(AuthContext);

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [demoUser, setDemoUser] = useState(false);
  // True while the user is going through a "reset password" email link —
  // Supabase signs them in automatically but they must set a new password
  // before landing in the app.
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  useEffect(() => {
    if (!hasSupabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email, password) => {
    if (!hasSupabase) throw new Error("Supabase non configuré (mode démo uniquement)");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (email, password, name) => {
    if (!hasSupabase) throw new Error("Supabase non configuré (mode démo uniquement)");
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    setDemoUser(false);
    if (hasSupabase) await supabase.auth.signOut();
    setUser(null);
  }, []);

  const resetPassword = useCallback(async (email) => {
    if (!hasSupabase) throw new Error("Supabase non configuré (mode démo uniquement)");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}${window.location.pathname}`,
    });
    if (error) throw error;
  }, []);

  const updatePassword = useCallback(async (password) => {
    if (!hasSupabase) throw new Error("Supabase non configuré (mode démo uniquement)");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    setPasswordRecovery(false);
  }, []);

  const value = { user, loading, demoUser, setDemoUser, signIn, signUp, signOut, resetPassword, updatePassword, passwordRecovery };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/* ============================================================================
 * STORE — switches between demo data and live Supabase data
 * ==========================================================================*/
function useStore(restaurantId) {
  const isHotelDemo = restaurantId === "demo-hotel";
  const demoMode = restaurantId === "demo" || isHotelDemo || !hasSupabase;
  const [menu, setMenu] = useState([]);
  const [orders, setOrders] = useState([]);
  const [doneOrders, setDoneOrders] = useState([]);
  const [tables, setTables] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [promos, setPromos] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (demoMode) {
      setMenu(isHotelDemo ? DEMO_HOTEL_MENU : DEMO_MENU);
      setOrders(isHotelDemo ? DEMO_HOTEL_ORDERS : DEMO_ORDERS);
      setDoneOrders(isHotelDemo ? DEMO_HOTEL_DONE : DEMO_DONE_ORDERS);
      setTables(
        isHotelDemo
          ? DEMO_HOTEL_ROOMS.map((n) => ({ id: `r${n}`, number: n }))
          : Array.from({ length: DEMO_RESTAURANT.tables_count }, (_, i) => ({ id: `t${i + 1}`, number: i + 1 }))
      );
      setIngredients(DEMO_INGREDIENTS);
      setPromos(DEMO_PROMOS);
      setCustomers(DEMO_CUSTOMERS);
      setReviews(DEMO_REVIEWS);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [m, o, tb, ing, pr, cu, rv] = await Promise.all([
      supabase.from("menu_items").select("*").eq("restaurant_id", restaurantId).order("sort_order", { ascending: true }),
      supabase.from("orders").select("*, table:tables(number, label), order_items(quantity, detail, menu_items(name, emoji, price))").eq("restaurant_id", restaurantId).order("created_at", { ascending: false }).limit(200),
      supabase.from("tables").select("*").eq("restaurant_id", restaurantId).order("number"),
      supabase.from("ingredients").select("*").eq("restaurant_id", restaurantId),
      supabase.from("promotions").select("*").eq("restaurant_id", restaurantId),
      supabase.from("customers").select("*").eq("restaurant_id", restaurantId),
      supabase.from("reviews").select("*").eq("restaurant_id", restaurantId).order("created_at", { ascending: false }),
    ]);
    // order_items est jointe pour reconstituer `items` (nom, emoji, prix) tel
    // qu'attendu par la vue Cuisine, la liste Commandes et le ticket imprimé.
    const allOrders = (o.data || []).map((ord) => ({
      ...ord,
      items: (ord.order_items || []).map((oi) => ({
        quantity: oi.quantity,
        name: oi.menu_items?.name || "Article",
        emoji: oi.menu_items?.emoji || "",
        price: oi.menu_items?.price ?? 0,
        detail: oi.detail || "",
      })),
    }));
    setMenu(m.data || []);
    setOrders(allOrders.filter((x) => x.status !== "DONE"));
    setDoneOrders(allOrders.filter((x) => x.status === "DONE"));
    setTables(tb.data || []);
    setIngredients(ing.data || []);
    setPromos(pr.data || []);
    setCustomers(cu.data || []);
    setReviews(rv.data || []);
    setLoading(false);
  }, [restaurantId, demoMode]);

  useEffect(() => {
    reload();
    if (demoMode || !hasSupabase) return;
    const channel = supabase
      .channel(`orders-${restaurantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` }, () => reload())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [reload, restaurantId, demoMode]);

  return {
    demoMode, loading, menu, orders, doneOrders, tables, ingredients, promos, customers, reviews,
    setMenu, setOrders, setIngredients, setPromos, reload,
  };
}

/* ============================================================================
 * UI PRIMITIVES
 * ==========================================================================*/
function Surface({ children, style, ...rest }) {
  return (
    <div style={{ background: C.surface, borderRadius: 18, border: `1px solid ${C.border}`, ...style }} {...rest}>
      {children}
    </div>
  );
}

function Tag({ children, color = C.accentBlue, bg }) {
  return (
    <span style={{ ...FF, fontSize: 12, fontWeight: 700, color, background: bg || `${color}1A`, padding: "3px 9px", borderRadius: 999, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

function Btn({ children, variant = "primary", size = "md", style, ...rest }) {
  const variants = {
    primary: { background: C.dark, color: C.white },
    blue: { background: C.accentBlue, color: C.white },
    red: { background: C.accent, color: C.white },
    green: { background: C.accentGreen, color: C.white },
    ghost: { background: "transparent", color: C.text, border: `1px solid ${C.borderStrong}` },
    subtle: { background: C.surfaceAlt, color: C.text, border: `1px solid ${C.border}` },
  };
  const sizes = {
    xs: { padding: "5px 10px", fontSize: 12, borderRadius: 9 },
    sm: { padding: "8px 14px", fontSize: 13, borderRadius: 11 },
    md: { padding: "11px 18px", fontSize: 14, borderRadius: 13 },
    lg: { padding: "15px 24px", fontSize: 16, borderRadius: 15 },
  };
  return (
    <button
      style={{ ...FF, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "opacity .15s", ...variants[variant], ...sizes[size], ...style }}
      {...rest}
    >
      {children}
    </button>
  );
}

function InputField({ label, style, ...rest }) {
  return (
    <label style={{ ...FF, display: "block", marginBottom: 14 }}>
      {label && <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: C.textSecondary, marginBottom: 6 }}>{label}</span>}
      <input
        style={{ ...FF, width: "100%", padding: "12px 14px", fontSize: 15, borderRadius: 12, border: `1px solid ${C.borderStrong}`, background: C.surface, color: C.text, outline: "none", ...style }}
        {...rest}
      />
    </label>
  );
}

function Logo({ size = 26, dark }) {
  return (
    <span style={{ ...FF, fontWeight: 900, fontSize: size, letterSpacing: -0.5, color: dark ? C.white : C.text }}>
      We<span style={{ color: C.accent }}>gemo</span>
    </span>
  );
}

function Dot({ color = C.accentGreen, size = 8 }) {
  return <span style={{ display: "inline-block", width: size, height: size, borderRadius: "50%", background: color }} />;
}

function Avatar({ name = "?", size = 36, color = C.accentBlue }) {
  return (
    <div style={{ ...FF, width: size, height: size, borderRadius: "50%", background: `${color}22`, color, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: size * 0.4 }}>
      {(name[0] || "?").toUpperCase()}
    </div>
  );
}

/* Toasts */
const ToastContext = createContext(() => {});
const useToast = () => useContext(ToastContext);
function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((msg, type = "info") => {
    const id = uid();
    setToasts((p) => [...p, { id, msg, type }]);
    setTimeout(() => setToasts((p) => p.filter((x) => x.id !== id)), 3000);
  }, []);
  const colors = { info: C.accentBlue, success: C.accentGreen, error: C.accent };
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div style={{ position: "fixed", top: 16, right: 16, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8 }}>
        {toasts.map((tt) => (
          <div key={tt.id} style={{ ...FF, background: C.dark, color: C.white, padding: "12px 16px", borderRadius: 12, fontSize: 14, fontWeight: 600, boxShadow: "0 8px 24px rgba(0,0,0,.2)", animation: "slideup .25s ease", borderLeft: `3px solid ${colors[tt.type]}`, maxWidth: 320 }}>
            {tt.msg}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* Charts (hand-rolled SVG) */
function LineChart({ data = [], height = 120, color = C.accentBlue }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const w = 100;
  const pts = data.map((v, i) => `${(i / (data.length - 1 || 1)) * w},${height - (v / max) * (height - 10) - 5}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ width: "100%", height }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BarChart({ data = [], labels = [], height = 140, color = C.accentBlue }) {
  const max = Math.max(...data, 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height, paddingTop: 10 }}>
      {data.map((v, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <div style={{ width: "100%", maxWidth: 36, height: `${(v / max) * (height - 30)}px`, background: color, borderRadius: "6px 6px 0 0", transition: "height .3s" }} />
          <span style={{ ...FF, fontSize: 10, color: C.textTertiary }}>{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

function MiniChart({ data = [], color = C.accentGreen }) {
  return <LineChart data={data} height={40} color={color} />;
}

/* QR canvas */
function QRCanvas({ value, size = 200, fg = "#000000", bg = "#FFFFFF", onReady }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !value) return;
    QRCode.toCanvas(ref.current, value, { width: size, margin: 1, color: { dark: fg, light: bg } }, (err) => {
      if (!err && onReady) onReady(ref.current);
    });
  }, [value, size, fg, bg, onReady]);
  return <canvas ref={ref} style={{ borderRadius: 12 }} />;
}

/* Modal shell */
function Modal({ children, onClose, width = 440 }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, animation: "fadein .2s" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.surface, borderRadius: 20, width: "100%", maxWidth: width, maxHeight: "90vh", overflow: "auto", animation: "slideup .25s ease" }}>
        {children}
      </div>
    </div>
  );
}

/* ============================================================================
 * AI CHAT (admin + customer share this)
 * ==========================================================================*/
function ChatPanel({ mode, context, title, lang = "fr", onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!input.trim() || busy) return;
    const userMsg = { role: "user", content: input.trim() };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      if (!hasSupabase) {
        setMessages((p) => [...p, { role: "assistant", content: "Assistant IA indisponible en mode démo. Configurez Supabase + OpenAI pour l'activer." }]);
      } else {
        const data = await callFunction("chat-agent", { messages: next, mode, context });
        setMessages((p) => [...p, { role: "assistant", content: data.content || "…" }]);
      }
    } catch {
      setMessages((p) => [...p, { role: "assistant", content: "Une erreur est survenue." }]);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", height: 440 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottom: `1px solid ${C.border}` }}>
        <strong style={{ ...FF }}>{title || "Assistant"}</strong>
        {onClose && <Btn variant="subtle" size="xs" onClick={onClose}>✕</Btn>}
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        {messages.length === 0 && <p style={{ ...FF, color: C.textTertiary, fontSize: 14 }}>{t(lang, "askAI")}…</p>}
        {messages.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "80%", background: m.role === "user" ? C.accentBlue : C.surfaceAlt, color: m.role === "user" ? C.white : C.text, padding: "9px 13px", borderRadius: 14, ...FF, fontSize: 14, whiteSpace: "pre-wrap" }}>
            {m.content}
          </div>
        ))}
        {busy && <div style={{ ...FF, color: C.textTertiary, fontSize: 13 }}>…</div>}
      </div>
      <div style={{ display: "flex", gap: 8, padding: 12, borderTop: `1px solid ${C.border}` }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder={t(lang, "askAI")} style={{ ...FF, flex: 1, padding: "10px 12px", borderRadius: 12, border: `1px solid ${C.borderStrong}`, outline: "none" }} />
        <Btn variant="blue" onClick={send} disabled={busy}>➤</Btn>
      </div>
    </div>
  );
}

/* ============================================================================
 * PRICING — modular plans (all services currently available)
 * ==========================================================================*/
// Base platform every restaurant starts from.
const PLAN_BASE = {
  id: "menu", name: "Wegemo Menu", price: 199, emoji: "🍽️", color: C.dark,
  tagline: "Le socle de votre restaurant",
  features: ["QR Codes", "Menu digital", "Commandes", "Paiement à la caisse", "Vue cuisine", "Inventaire automatique"],
};
// Paid add-on layered on top of the base.
const PLAN_ADDON = {
  id: "mobile-pay", name: "Option Paiement Mobile", price: 49, prefix: "+", emoji: "📲", color: C.accentBlue,
  tagline: "Encaissez depuis le téléphone du client",
  features: ["Stripe", "Apple Pay", "Google Pay", "Paiement depuis le téléphone"],
};
// Independent modules, each activable on its own.
const PLAN_MODULES = [
  { id: "growth", name: "Wegemo Growth", price: 99, emoji: "📈", color: C.accentGreen, tagline: "Faites revenir vos clients",
    features: ["Matching influenceurs", "CRM", "Campagnes IA", "Relances clients"] },
  { id: "voice", name: "Wegemo Voice", price: 99, emoji: "📞", color: C.accentPurple, tagline: "Un standard qui ne dort jamais",
    features: ["Assistant téléphonique IA 24/7", "Réservations", "FAQ", "Prise de commandes"] },
  { id: "manager", name: "Wegemo Manager", price: 149, emoji: "🧑‍💼", color: C.accentOrange, tagline: "Pilotez à distance",
    features: ["Dashboard manager", "Statistiques", "Contrôle à distance", "Multi-utilisateurs"] },
  { id: "franchise", name: "Wegemo Franchise", price: 299, emoji: "🏢", color: C.accent, tagline: "Gérez tout votre réseau",
    features: ["Multi-sites", "Dashboard groupe", "Comparaison des établissements", "Gestion franchises"] },
];
// All-inclusive bundle.
const PLAN_OS = {
  id: "os", name: "Wegemo OS", price: 499, emoji: "🚀", color: C.accentPurple,
  tagline: "Tout inclus, sans compromis",
  features: ["Wegemo Menu", "Paiement Mobile", "Growth", "Voice", "Manager", "Franchise"],
};

/* Canonical module catalog — what each subscription module unlocks in the app.
 * `base` is the 199€ socle and is always active; the rest gate features. */
const MODULE_CATALOG = [
  { id: "base", name: "Wegemo Menu", emoji: "🍽️", price: 199, color: C.dark,
    desc: "Le socle : QR codes, menu, commandes, caisse, inventaire, vue cuisine." },
  { id: "mobile_pay", name: "Paiement Mobile", emoji: "📲", price: 49, color: C.accentBlue,
    desc: "Paiement en ligne (Stripe, Apple Pay, Google Pay) depuis le téléphone du client." },
  { id: "growth", name: "Wegemo Growth", emoji: "📈", price: 99, color: C.accentGreen,
    desc: "CRM, promotions et campagnes IA pour faire revenir vos clients." },
  { id: "voice", name: "Wegemo Voice", emoji: "📞", price: 99, color: C.accentPurple,
    desc: "Assistant téléphonique IA 24/7 : réservations, FAQ, prise de commandes." },
  { id: "manager", name: "Wegemo Manager", emoji: "🧑‍💼", price: 149, color: C.accentOrange,
    desc: "Statistiques avancées, contrôle à distance et multi-utilisateurs." },
  { id: "franchise", name: "Wegemo Franchise", emoji: "🏢", price: 299, color: C.accent,
    desc: "Dashboard groupe multi-restaurants et comparaison des établissements." },
];
const ALL_MODULES = MODULE_CATALOG.map((m) => m.id);
const moduleInfo = (id) => MODULE_CATALOG.find((m) => m.id === id) || { id, name: id, emoji: "🔒", color: C.textTertiary, desc: "", price: 0 };

// Billing isn't wired yet, so every account runs with all modules unlocked.
// Flip to false to enforce per-plan gating (seed modules from the chosen plan).
const SEED_ALL_MODULES = true;
const defaultModules = () => (SEED_ALL_MODULES ? [...ALL_MODULES] : ["base"]);

// Map a chosen pricing plan id to the set of modules it activates.
function planToModules(planId) {
  switch (planId) {
    case "mobile-pay": return ["base", "mobile_pay"];
    case "growth": return ["base", "growth"];
    case "voice": return ["base", "voice"];
    case "manager": return ["base", "manager"];
    case "franchise": return ["base", "franchise"];
    case "os": return [...ALL_MODULES];
    case "menu":
    default: return ["base"];
  }
}

// Normalise whatever is stored into a clean module list that always includes base.
function normalizeModules(raw) {
  const list = Array.isArray(raw) ? raw.filter((m) => ALL_MODULES.includes(m)) : [];
  return list.includes("base") ? list : ["base", ...list];
}

function PlanCard({ plan, featured, onChoose, ctaLabel = "Choisir" }) {
  return (
    <Surface
      style={{
        padding: 22, display: "flex", flexDirection: "column", height: "100%",
        border: `1.5px solid ${featured ? plan.color : C.border}`,
        boxShadow: featured ? `0 12px 32px ${plan.color}22` : "none",
        position: "relative", overflow: "hidden",
      }}
    >
      {featured && (
        <div style={{ position: "absolute", top: 14, right: -32, transform: "rotate(45deg)", background: plan.color, color: C.white, ...FF, fontSize: 11, fontWeight: 800, padding: "3px 36px" }}>
          POPULAIRE
        </div>
      )}
      <div style={{ fontSize: 30 }}>{plan.emoji}</div>
      <h3 style={{ ...FF, fontSize: 19, fontWeight: 800, marginTop: 8 }}>{plan.name}</h3>
      {plan.tagline && <p style={{ ...FF, fontSize: 13, color: C.textSecondary, marginTop: 2 }}>{plan.tagline}</p>}
      <div style={{ ...FF, marginTop: 14, marginBottom: 14 }}>
        <span style={{ fontSize: 34, fontWeight: 900, color: plan.color }}>{plan.prefix || ""}{plan.price}€</span>
        <span style={{ fontSize: 14, color: C.textTertiary }}> /mois</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
        {plan.features.map((f) => (
          <div key={f} style={{ ...FF, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: plan.color, fontWeight: 800 }}>✓</span> {f}
          </div>
        ))}
      </div>
      <Btn
        variant={featured ? "primary" : "subtle"}
        size="md"
        style={featured ? { marginTop: 18, background: plan.color } : { marginTop: 18 }}
        onClick={() => onChoose?.(plan)}
      >
        {ctaLabel}
      </Btn>
    </Surface>
  );
}

function PricingPage({ onBack, onSignup }) {
  const toast = useToast();
  const choose = (plan) => {
    try { localStorage.setItem("wegemo_signup_plan", plan.id); } catch { /* storage unavailable */ }
    toast(`Offre « ${plan.name} » sélectionnée`, "success");
    onSignup?.(plan);
  };
  const sectionTitle = (txt) => (
    <h2 style={{ ...FF, fontSize: 20, fontWeight: 800, margin: "8px 0 14px" }}>{txt}</h2>
  );

  return (
    <div style={{ minHeight: "100vh", background: C.bg }}>
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <Logo size={26} />
          <Btn variant="ghost" size="sm" onClick={onBack}>← Retour</Btn>
        </div>

        <div style={{ textAlign: "center", marginBottom: 8 }}>
          <Tag color={C.accentGreen}>✓ Tous les services sont disponibles</Tag>
          <h1 style={{ ...FF, fontSize: 34, fontWeight: 900, margin: "14px 0 8px" }}>
            Une offre <span style={{ color: C.accent }}>modulaire</span>
          </h1>
          <p style={{ ...FF, fontSize: 16, color: C.textSecondary, maxWidth: 560, margin: "0 auto 28px" }}>
            Démarrez avec le socle, ajoutez le paiement mobile, puis activez les modules dont vous avez besoin — ou prenez tout avec Wegemo OS.
          </p>
        </div>

        {/* Socle + option */}
        {sectionTitle("1. Le socle")}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginBottom: 28 }}>
          <PlanCard plan={PLAN_BASE} featured onChoose={choose} ctaLabel="Commencer" />
          <PlanCard plan={PLAN_ADDON} onChoose={choose} ctaLabel="Ajouter l'option" />
        </div>

        {/* Modules */}
        {sectionTitle("2. Les modules (à la carte)")}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16, marginBottom: 28 }}>
          {PLAN_MODULES.map((m) => (
            <PlanCard key={m.id} plan={m} onChoose={choose} ctaLabel="Activer" />
          ))}
        </div>

        {/* All inclusive */}
        {sectionTitle("3. Tout inclus")}
        <div style={{ marginBottom: 32 }}>
          <PlanCard plan={PLAN_OS} featured onChoose={choose} ctaLabel="Tout débloquer" />
        </div>

        <p style={{ ...FF, textAlign: "center", color: C.textTertiary, fontSize: 13 }}>
          Sans engagement · Résiliable à tout moment · TVA non incluse
        </p>
      </div>
    </div>
  );
}

/* ============================================================================
 * LANDING
 * ==========================================================================*/
function LandingPage({ onDemo, onLogin, onSignup, onPricing, vertical, setVertical }) {
  const V = verticalOf(vertical);
  const heroWord = V.hero.split("réinventé");
  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
      {/* Vertical selector */}
      <div style={{ display: "flex", gap: 6, background: C.surfaceAlt, padding: 5, borderRadius: 999, marginBottom: 22 }}>
        {["resto", "hotel"].map((id) => (
          <button key={id} onClick={() => setVertical(id)} style={{ ...FF, padding: "9px 18px", borderRadius: 999, fontWeight: 800, fontSize: 14, border: "none", cursor: "pointer", background: vertical === id ? C.surface : "transparent", color: vertical === id ? C.text : C.textSecondary, boxShadow: vertical === id ? "0 1px 4px rgba(0,0,0,.12)" : "none" }}>
            {verticalOf(id).switchLabel}
          </button>
        ))}
      </div>

      <Logo size={48} />
      <div style={{ ...FF, fontSize: 13, fontWeight: 800, color: V.accent, marginTop: 8, letterSpacing: 0.4, textTransform: "uppercase" }}>{V.name}</div>
      <h1 style={{ ...FF, fontSize: 40, fontWeight: 900, margin: "16px 0 12px", maxWidth: 640, lineHeight: 1.1 }}>
        {heroWord[0]}<span style={{ color: V.accent }}>réinventé</span>{heroWord[1]}
      </h1>
      <p style={{ ...FF, fontSize: 18, color: C.textSecondary, maxWidth: 540, marginBottom: 28 }}>{V.sub}</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", marginBottom: 18 }}>
        <Btn variant="primary" size="lg" style={{ background: V.accent }} onClick={onDemo}>🚀 Voir la démo {vertical === "hotel" ? "hôtel" : ""}</Btn>
        <Btn variant="subtle" size="lg" onClick={onLogin}>Se connecter</Btn>
        <Btn variant="red" size="lg" onClick={onSignup}>Créer un compte</Btn>
      </div>
      <button onClick={onPricing} style={{ ...FF, color: C.accentBlue, fontWeight: 700, fontSize: 15, marginBottom: 32 }}>
        💎 Voir les offres & tarifs →
      </button>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", maxWidth: 640 }}>
        {V.features.map((f) => (
          <Tag key={f} color={C.accentGreen}>✓ {f}</Tag>
        ))}
      </div>
    </div>
  );
}

/* ============================================================================
 * SIGNUP / LOGIN
 * ==========================================================================*/
function SignupPage({ initialMode = "login", onBack, onSuccess }) {
  const { signIn, signUp, resetPassword } = useAuth();
  const toast = useToast();
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "login") {
        await signIn(email, password);
        toast("Connecté !", "success");
        onSuccess?.();
      } else if (mode === "forgot") {
        await resetPassword(email);
        setSent(true);
      } else {
        await signUp(email, password, name);
        setSent(true);
        toast("Vérifiez votre email pour confirmer.", "success");
      }
    } catch (err) {
      toast(err.message || "Erreur", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <Surface style={{ width: "100%", maxWidth: 400, padding: 28 }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <Logo size={32} />
        </div>
        {sent ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 40 }}>📧</div>
            <h3 style={{ ...FF, margin: "12px 0" }}>Vérifiez votre boîte mail</h3>
            <p style={{ ...FF, color: C.textSecondary, fontSize: 14 }}>
              {mode === "forgot"
                ? <>Un lien de réinitialisation a été envoyé à {email}. Ouvrez-le pour choisir un nouveau mot de passe.</>
                : <>Un lien de confirmation a été envoyé à {email}.</>}
            </p>
            <Btn variant="subtle" style={{ marginTop: 16 }} onClick={onBack}>Retour</Btn>
          </div>
        ) : mode === "forgot" ? (
          <form onSubmit={submit}>
            <h3 style={{ ...FF, fontSize: 18, fontWeight: 800, textAlign: "center", marginBottom: 6 }}>Mot de passe oublié</h3>
            <p style={{ ...FF, fontSize: 13, color: C.textSecondary, textAlign: "center", marginBottom: 18 }}>
              Entrez votre email, on vous envoie un lien pour en choisir un nouveau.
            </p>
            <InputField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Btn type="submit" variant="primary" size="lg" style={{ width: "100%", marginTop: 6 }} disabled={busy}>
              {busy ? "…" : "Envoyer le lien"}
            </Btn>
            <button type="button" onClick={() => setMode("login")} style={{ ...FF, display: "block", margin: "16px auto 0", color: C.textSecondary, fontSize: 13 }}>← Retour à la connexion</button>
          </form>
        ) : (
          <form onSubmit={submit}>
            <div style={{ display: "flex", gap: 6, background: C.surfaceAlt, padding: 4, borderRadius: 12, marginBottom: 20 }}>
              {["login", "signup"].map((m) => (
                <button key={m} type="button" onClick={() => setMode(m)} style={{ ...FF, flex: 1, padding: "8px", borderRadius: 9, fontWeight: 700, fontSize: 13, background: mode === m ? C.surface : "transparent", color: mode === m ? C.text : C.textSecondary, boxShadow: mode === m ? "0 1px 3px rgba(0,0,0,.1)" : "none" }}>
                  {m === "login" ? "Connexion" : "Inscription"}
                </button>
              ))}
            </div>
            {mode === "signup" && <InputField label="Nom" value={name} onChange={(e) => setName(e.target.value)} required />}
            <InputField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <InputField label="Mot de passe" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            {mode === "login" && (
              <button type="button" onClick={() => setMode("forgot")} style={{ ...FF, display: "block", marginBottom: 14, color: C.accentBlue, fontSize: 13, fontWeight: 600 }}>
                Mot de passe oublié ?
              </button>
            )}
            <Btn type="submit" variant="primary" size="lg" style={{ width: "100%", marginTop: 6 }} disabled={busy}>
              {busy ? "…" : mode === "login" ? "Se connecter" : "Créer mon compte"}
            </Btn>
            <button type="button" onClick={onBack} style={{ ...FF, display: "block", margin: "16px auto 0", color: C.textSecondary, fontSize: 13 }}>← Retour</button>
          </form>
        )}
      </Surface>
    </div>
  );
}

// Landed here after clicking the "reset password" email link (Supabase signs
// the user in and fires PASSWORD_RECOVERY). Must choose a new password before
// entering the app.
function NewPasswordPage() {
  const { updatePassword, signOut } = useAuth();
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (password.length < 6) return toast("6 caractères minimum", "error");
    if (password !== confirm) return toast("Les mots de passe ne correspondent pas", "error");
    setBusy(true);
    try {
      await updatePassword(password);
      setDone(true);
      toast("Mot de passe mis à jour !", "success");
    } catch (err) {
      toast(err.message || "Erreur", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <Surface style={{ width: "100%", maxWidth: 400, padding: 28 }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <Logo size={32} />
        </div>
        {done ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 40 }}>✅</div>
            <h3 style={{ ...FF, margin: "12px 0" }}>Mot de passe mis à jour</h3>
            <p style={{ ...FF, color: C.textSecondary, fontSize: 14, marginBottom: 16 }}>Reconnectez-vous avec votre nouveau mot de passe.</p>
            <Btn variant="primary" size="lg" style={{ width: "100%" }} onClick={() => signOut()}>Continuer</Btn>
          </div>
        ) : (
          <form onSubmit={submit}>
            <h3 style={{ ...FF, fontSize: 18, fontWeight: 800, textAlign: "center", marginBottom: 6 }}>Nouveau mot de passe</h3>
            <p style={{ ...FF, fontSize: 13, color: C.textSecondary, textAlign: "center", marginBottom: 18 }}>Choisissez votre nouveau mot de passe.</p>
            <InputField label="Nouveau mot de passe" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            <InputField label="Confirmer le mot de passe" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={6} />
            <Btn type="submit" variant="primary" size="lg" style={{ width: "100%", marginTop: 6 }} disabled={busy}>
              {busy ? "…" : "Valider"}
            </Btn>
          </form>
        )}
      </Surface>
    </div>
  );
}

/* ============================================================================
 * RESTAURANTS LIST + CREATE
 * ==========================================================================*/
function RestaurantsPage({ onOpen, onSignOut }) {
  const { user } = useAuth();
  const toast = useToast();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", address: "", logo_emoji: "🍽️", tables_count: 4 });

  const load = useCallback(async () => {
    if (!hasSupabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase.from("restaurants").select("*").eq("owner_id", user.id).order("created_at");
    setList(data || []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (e) => {
    e.preventDefault();
    if (!hasSupabase) {
      toast("Mode démo : création indisponible.", "error");
      return;
    }
    let slug = slugify(form.name);
    const { data: existing } = await supabase.from("restaurants").select("id").eq("slug", slug).maybeSingle();
    if (existing) slug = `${slug}-${Math.random().toString(36).slice(2, 5)}`;
    const { data, error } = await supabase
      .from("restaurants")
      .insert({ ...form, slug, owner_id: user.id, tables_count: Number(form.tables_count) })
      .select()
      .single();
    if (error) return toast(error.message, "error");
    // generate the tables
    const tablesRows = Array.from({ length: Number(form.tables_count) }, (_, i) => ({ restaurant_id: data.id, number: i + 1 }));
    await supabase.from("tables").insert(tablesRows);
    // seed the restaurant's active modules — everything for now (SEED_ALL_MODULES),
    // or from the plan chosen at signup once per-plan gating is enforced.
    let initialModules = defaultModules();
    if (!SEED_ALL_MODULES) {
      try {
        const planId = localStorage.getItem("wegemo_signup_plan");
        if (planId) initialModules = planToModules(planId);
      } catch { /* storage unavailable */ }
    }
    await supabase.from("restaurant_settings").upsert({ restaurant_id: data.id, active_modules: initialModules }, { onConflict: "restaurant_id" });
    toast("Restaurant créé !", "success");
    setCreating(false);
    setForm({ name: "", address: "", logo_emoji: "🍽️", tables_count: 4 });
    load();
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, padding: 24 }}>
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <Logo size={28} />
          <Btn variant="ghost" size="sm" onClick={onSignOut}>Déconnexion</Btn>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ ...FF, fontSize: 24, fontWeight: 800 }}>Mes restaurants</h2>
          <Btn variant="primary" onClick={() => setCreating((v) => !v)}>+ Nouveau</Btn>
        </div>

        {creating && (
          <Surface style={{ padding: 20, marginBottom: 20 }}>
            <form onSubmit={create}>
              <InputField label="Nom du restaurant" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <InputField label="Adresse" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              <div style={{ display: "flex", gap: 12 }}>
                <InputField label="Emoji" value={form.logo_emoji} onChange={(e) => setForm({ ...form, logo_emoji: e.target.value })} style={{ width: 80 }} />
                <div style={{ flex: 1 }}>
                  <InputField label="Nombre de tables" type="number" min={1} value={form.tables_count} onChange={(e) => setForm({ ...form, tables_count: e.target.value })} />
                </div>
              </div>
              <Btn type="submit" variant="primary" size="lg" style={{ width: "100%" }}>Créer</Btn>
            </form>
          </Surface>
        )}

        {loading ? (
          <p style={{ ...FF, color: C.textSecondary }}>Chargement…</p>
        ) : list.length === 0 ? (
          <Surface style={{ padding: 32, textAlign: "center" }}>
            <div style={{ fontSize: 40 }}>🍴</div>
            <p style={{ ...FF, color: C.textSecondary, marginTop: 8 }}>Aucun restaurant pour le moment. Créez le premier !</p>
          </Surface>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
            {list.map((r) => (
              <Surface key={r.id} style={{ padding: 18, cursor: "pointer" }} onClick={() => onOpen(r)}>
                <div style={{ fontSize: 32 }}>{r.logo_emoji}</div>
                <h3 style={{ ...FF, fontSize: 18, fontWeight: 800, marginTop: 8 }}>{r.name}</h3>
                <p style={{ ...FF, fontSize: 13, color: C.textSecondary }}>{r.address || "—"}</p>
                <div style={{ marginTop: 10, display: "flex", gap: 6 }}>
                  <Tag color={C.accentBlue}>{r.tables_count} tables</Tag>
                  <Tag color={C.textTertiary}>/{r.slug}</Tag>
                </div>
              </Surface>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================================
 * DASHBOARD
 * ==========================================================================*/
const DASH_TABS = [
  { id: "setup", label: "Setup", icon: "⚡", module: "base" },
  { id: "overview", label: "Overview", icon: "📊", module: "base" },
  { id: "orders", label: "Commandes", icon: "🧾", module: "base" },
  { id: "pos", label: "Vente", icon: "🛒", module: "base" },
  { id: "register", label: "Caisse", icon: "💶", module: "base" },
  { id: "qr", label: "QR Codes", icon: "🔳", module: "base" },
  { id: "inventory", label: "Inventaire", icon: "📦", module: "base" },
  { id: "promos", label: "Promos", icon: "🎁", module: "growth" },
  { id: "menu", label: "Carte", icon: "🍽️", module: "base" },
  { id: "crm", label: "CRM", icon: "👥", module: "growth" },
  { id: "influencers", label: "Influenceurs", icon: "📣", module: "growth" },
  { id: "tracking", label: "Tracking", icon: "🔗", module: "growth" },
  { id: "settings", label: "Paramètres", icon: "⚙️", module: "base" },
];

// Loads the active module set for a restaurant. Demo mode and accounts without
// an explicit selection default to every module unlocked (see SEED_ALL_MODULES).
function useModules(restaurantId, demoMode) {
  const [modules, setModules] = useState(() => (demoMode ? [...ALL_MODULES] : defaultModules()));
  useEffect(() => {
    if (demoMode || !hasSupabase) { setModules([...ALL_MODULES]); return; }
    let active = true;
    supabase.from("restaurant_settings").select("active_modules").eq("restaurant_id", restaurantId).maybeSingle()
      .then(({ data }) => { if (active) setModules(data?.active_modules ? normalizeModules(data.active_modules) : defaultModules()); });
    return () => { active = false; };
  }, [restaurantId, demoMode]);
  return [modules, setModules];
}

// Upsell panel shown in place of a feature whose module isn't active.
function LockedFeature({ module, onManage }) {
  const info = moduleInfo(module);
  return (
    <div style={{ maxWidth: 520, margin: "40px auto" }}>
      <Surface style={{ padding: 32, textAlign: "center" }}>
        <div style={{ fontSize: 46 }}>{info.emoji}</div>
        <div style={{ marginTop: 8 }}><Tag color={info.color}>🔒 Module non activé</Tag></div>
        <h2 style={{ ...FF, fontSize: 24, fontWeight: 800, margin: "12px 0 6px" }}>{info.name}</h2>
        <p style={{ ...FF, color: C.textSecondary, fontSize: 14, maxWidth: 360, margin: "0 auto" }}>{info.desc}</p>
        <div style={{ ...FF, margin: "16px 0" }}>
          <span style={{ fontSize: 30, fontWeight: 900, color: info.color }}>+{info.price}€</span>
          <span style={{ color: C.textTertiary, fontSize: 13 }}> /mois</span>
        </div>
        <Btn variant="primary" size="lg" style={{ background: info.color }} onClick={onManage}>Activer ce module →</Btn>
      </Surface>
    </div>
  );
}

// Build the tab list for a vertical: relabel + insert extra tabs (e.g. Check-in).
function dashTabsFor(V) {
  const tabs = DASH_TABS.map((t) => ({ ...t, label: V.tabLabels[t.id] || t.label }));
  (V.extraTabs || []).forEach((et) => {
    const i = tabs.findIndex((b) => b.id === et.afterId);
    tabs.splice(i >= 0 ? i + 1 : tabs.length, 0, et);
  });
  return tabs;
}

function DashboardPage({ restaurant, onBack, onKitchen, onCustomerView, onFranchise, vertical }) {
  const isMobile = useIsMobile();
  const store = useStore(restaurant.id);
  const [modules, setModules] = useModules(restaurant.id, store.demoMode);
  const [tab, setTab] = useState("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const V = verticalOf(vertical || restaurant.vertical || "resto");
  const tabs = dashTabsFor(V);
  const showFranchise = onFranchise && modules.includes("franchise") && (store.demoMode || restaurant.group_id);

  // Impression automatique des commandes : montée ici (et non seulement dans
  // l'écran Cuisine séparé) pour qu'un ticket sorte quel que soit l'onglet
  // affiché — un restaurateur qui vit dans l'onglet Commandes plutôt que
  // dans le kiosque Cuisine dédié doit obtenir le même résultat.
  const printSettings = useRestaurantSettings(restaurant.id, store.demoMode);
  const { printing, dequeue } = useAutoPrintQueue(store, printSettings.auto_print_enabled);

  const sidebar = (
    <div style={{ width: 220, background: C.surface, borderRight: `1px solid ${C.border}`, padding: 16, display: "flex", flexDirection: "column", gap: 4, height: "100%", overflow: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px 14px" }}>
        <span style={{ fontSize: 24 }}>{restaurant.logo_emoji}</span>
        <strong style={{ ...FF, fontSize: 15 }}>{restaurant.name}</strong>
      </div>
      {tabs.map((tt) => {
        const locked = tt.module !== "base" && !modules.includes(tt.module);
        return (
          <button key={tt.id} onClick={() => { setTab(tt.id); setSidebarOpen(false); }} style={{ ...FF, display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 11, fontWeight: 600, fontSize: 14, textAlign: "left", background: tab === tt.id ? C.surfaceAlt : "transparent", color: tab === tt.id ? C.text : C.textSecondary }}>
            <span>{tt.icon}</span> <span style={{ flex: 1 }}>{tt.label}</span>
            {locked && <span style={{ fontSize: 12, opacity: 0.7 }}>🔒</span>}
          </button>
        );
      })}
      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 6, paddingTop: 12 }}>
        <Btn variant="subtle" size="sm" onClick={onKitchen}>{V.id === "hotel" ? "🍳 Office" : "👨‍🍳 Cuisine"}</Btn>
        <Btn variant="subtle" size="sm" onClick={onCustomerView}>📱 Vue client</Btn>
        {showFranchise && <Btn variant="subtle" size="sm" onClick={onFranchise}>🏢 Groupe</Btn>}
        <Btn variant="ghost" size="sm" onClick={onBack}>← Restaurants</Btn>
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", height: "100vh", background: C.bg, overflow: "hidden" }}>
      {!isMobile && sidebar}
      {isMobile && sidebarOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 500, display: "flex" }}>
          <div onClick={() => setSidebarOpen(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.4)" }} />
          <div style={{ position: "relative", zIndex: 1 }}>{sidebar}</div>
        </div>
      )}
      <div style={{ flex: 1, overflow: "auto" }}>
        {isMobile && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 14, background: C.surface, borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, zIndex: 10 }}>
            <Btn variant="subtle" size="sm" onClick={() => setSidebarOpen(true)}>☰</Btn>
            <strong style={{ ...FF }}>{tabs.find((x) => x.id === tab)?.label}</strong>
            <span style={{ fontSize: 20 }}>{restaurant.logo_emoji}</span>
          </div>
        )}
        <div style={{ padding: isMobile ? 16 : 28, maxWidth: 1100, margin: "0 auto" }}>
          {store.loading ? (
            <p style={{ ...FF, color: C.textSecondary }}>Chargement…</p>
          ) : (
            <DashTabContent tab={tab} setTab={setTab} restaurant={restaurant} store={store} onKitchen={onKitchen} onCustomerView={onCustomerView} modules={modules} setModules={setModules} vertical={V.id} />
          )}
        </div>
      </div>
      <TicketPrintLayer job={printing} onDone={dequeue} restaurant={restaurant} settings={printSettings} />
    </div>
  );
}

function DashTabContent({ tab, setTab, restaurant, store, onKitchen, onCustomerView, modules, setModules, vertical }) {
  const tabDef = DASH_TABS.find((t) => t.id === tab);
  if (tabDef && tabDef.module !== "base" && !modules.includes(tabDef.module)) {
    return <LockedFeature module={tabDef.module} onManage={() => setTab("settings")} />;
  }
  if (tab === "checkin") return <CheckinTab restaurant={restaurant} store={store} />;
  switch (tab) {
    case "setup": return <SetupTab restaurant={restaurant} store={store} setTab={setTab} />;
    case "overview": return <OverviewTab restaurant={restaurant} store={store} onKitchen={onKitchen} onCustomerView={onCustomerView} />;
    case "orders": return <OrdersTab restaurant={restaurant} store={store} />;
    case "pos": return <PosTab restaurant={restaurant} store={store} />;
    case "register": return <RegisterTab restaurant={restaurant} store={store} />;
    case "qr": return <QRTab restaurant={restaurant} store={store} />;
    case "inventory": return <InventoryTab restaurant={restaurant} store={store} />;
    case "promos": return <PromosTab restaurant={restaurant} store={store} />;
    case "menu": return <MenuTab restaurant={restaurant} store={store} />;
    case "crm": return <CRMTab restaurant={restaurant} store={store} />;
    case "influencers": return <InfluencerTab restaurant={restaurant} store={store} />;
    case "tracking": return <TrackingTab restaurant={restaurant} store={store} />;
    case "settings": return <SettingsTab restaurant={restaurant} store={store} modules={modules} onModulesChange={setModules} />;
    default: return null;
  }
}

/* ---- Setup ---- */
function SetupTab({ restaurant, store, setTab }) {
  const toast = useToast();
  const { steps, complete } = useOnboarding(store.demoMode);
  const [menuText, setMenuText] = useState("");
  const [busy, setBusy] = useState(false);
  const [lang, setLang] = useState("fr");

  const importMenu = async () => {
    if (!menuText.trim()) return;
    setBusy(true);
    try {
      if (!hasSupabase) {
        toast("Import IA indisponible en mode démo.", "error");
      } else {
        const data = await callFunction("chat-agent", { mode: "setup-menu", text: menuText });
        const items = (data.items || []).map((it) => ({ ...it, restaurant_id: restaurant.id, available: true }));
        if (items.length) {
          await supabase.from("menu_items").insert(items);
          toast(`${items.length} plats importés !`, "success");
          complete("menu");
          store.reload();
          setTab("menu");
        } else toast("Aucun plat détecté.", "error");
      }
    } catch (e) {
      toast(e.message || "Erreur d'import", "error");
    } finally {
      setBusy(false);
    }
  };

  const onbItems = [
    { id: "menu", label: "Importer votre carte", done: steps.menu || store.menu.length > 0 },
    { id: "qr", label: "Générer vos QR codes", done: steps.qr },
    { id: "stripe", label: "Configurer le paiement", done: steps.stripe },
    { id: "test", label: "Tester une commande", done: steps.test },
  ];

  return (
    <div>
      <h2 style={{ ...FF, fontSize: 22, fontWeight: 800, marginBottom: 4 }}>⚡ Configuration rapide</h2>
      <p style={{ ...FF, color: C.textSecondary, marginBottom: 20 }}>Lancez votre restaurant en quelques minutes.</p>

      <Surface style={{ padding: 20, marginBottom: 16 }}>
        <strong style={{ ...FF }}>Progression</strong>
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {onbItems.map((o) => (
            <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 18 }}>{o.done ? "✅" : "⬜"}</span>
              <span style={{ ...FF, fontSize: 14, color: o.done ? C.textTertiary : C.text, textDecoration: o.done ? "line-through" : "none" }}>{o.label}</span>
            </div>
          ))}
        </div>
      </Surface>

      <Surface style={{ padding: 20, marginBottom: 16 }}>
        <strong style={{ ...FF }}>🤖 Importer votre menu par IA</strong>
        <p style={{ ...FF, fontSize: 13, color: C.textSecondary, margin: "6px 0 10px" }}>Collez votre carte (site web, PDF, WhatsApp), l'IA la structure automatiquement.</p>
        <textarea value={menuText} onChange={(e) => setMenuText(e.target.value)} placeholder="Burger maison 14,50€ — bœuf, cheddar..." style={{ ...FF, width: "100%", minHeight: 120, padding: 12, borderRadius: 12, border: `1px solid ${C.borderStrong}`, outline: "none", resize: "vertical" }} />
        <Btn variant="primary" style={{ marginTop: 10 }} onClick={importMenu} disabled={busy}>{busy ? "Analyse…" : "Importer avec l'IA"}</Btn>
      </Surface>

      <Surface style={{ padding: 20 }}>
        <strong style={{ ...FF }}>🌍 Langue du tableau de bord</strong>
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          {LANG_OPTIONS.map((l) => (
            <button key={l.code} onClick={() => setLang(l.code)} style={{ ...FF, padding: "8px 14px", borderRadius: 11, border: `1px solid ${lang === l.code ? C.accent : C.border}`, background: lang === l.code ? `${C.accent}11` : C.surface, fontWeight: 600, fontSize: 14 }}>
              {l.flag} {l.name}
            </button>
          ))}
        </div>
      </Surface>
    </div>
  );
}

/* ---- Overview ---- */
function OverviewTab({ store, onKitchen, onCustomerView }) {
  const todayDone = store.doneOrders;
  const revenue = todayDone.reduce((s, o) => s + Number(o.total || 0), 0);
  const orderCount = store.orders.length + todayDone.length;
  const avgBasket = orderCount ? revenue / Math.max(todayDone.length, 1) : 0;
  const lowStock = store.ingredients.filter((i) => i.alert_threshold != null && Number(i.stock) <= Number(i.alert_threshold));
  const trend = [12, 19, 14, 22, 28, 24, 31];

  const kpis = [
    { label: "CA du jour", value: eur(revenue), color: C.accentGreen },
    { label: "Commandes", value: orderCount, color: C.accentBlue },
    { label: "Panier moyen", value: eur(avgBasket), color: C.accentOrange },
    { label: "Clients", value: store.customers.length, color: C.accentPurple },
  ];

  return (
    <div>
      <h2 style={{ ...FF, fontSize: 22, fontWeight: 800, marginBottom: 16 }}>📊 Vue d'ensemble</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 16 }}>
        {kpis.map((k) => (
          <Surface key={k.label} style={{ padding: 16 }}>
            <span style={{ ...FF, fontSize: 13, color: C.textSecondary }}>{k.label}</span>
            <div style={{ ...FF, fontSize: 26, fontWeight: 900, color: k.color, marginTop: 4 }}>{k.value}</div>
          </Surface>
        ))}
      </div>
      <Surface style={{ padding: 20, marginBottom: 16 }}>
        <strong style={{ ...FF }}>Tendance 7 jours</strong>
        <BarChart data={trend} labels={["L", "M", "M", "J", "V", "S", "D"]} color={C.accentBlue} />
      </Surface>
      {lowStock.length > 0 && (
        <Surface style={{ padding: 16, marginBottom: 16, borderColor: `${C.accent}55` }}>
          <strong style={{ ...FF, color: C.accent }}>⚠️ Alertes stock</strong>
          <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {lowStock.map((i) => <Tag key={i.id} color={C.accent}>{i.emoji} {i.name} : {i.stock} {i.unit}</Tag>)}
          </div>
        </Surface>
      )}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Btn variant="primary" onClick={onKitchen}>👨‍🍳 Ouvrir la cuisine</Btn>
        <Btn variant="subtle" onClick={onCustomerView}>📱 Voir la vue client</Btn>
      </div>
    </div>
  );
}

/* ---- Orders ---- */
const STATUS_META = {
  PENDING: { label: "Nouvelle", color: C.accentOrange },
  PREPARING: { label: "En préparation", color: C.accentBlue },
  READY: { label: "Prête", color: C.accentGreen },
  DONE: { label: "Terminée", color: C.textTertiary },
};

function OrdersTab({ restaurant, store }) {
  const toast = useToast();
  const [filter, setFilter] = useState("ALL");
  const [editing, setEditing] = useState(null);
  const settings = useRestaurantSettings(restaurant.id, store.demoMode);
  const [printing, setPrinting] = useState(null);

  const updateStatus = async (order, status) => {
    if (!store.demoMode && hasSupabase) {
      await supabase.from("orders").update({ status }).eq("id", order.id);
      store.reload();
    } else {
      store.setOrders((p) => p.map((o) => (o.id === order.id ? { ...o, status } : o)));
    }
    toast(`Commande → ${STATUS_META[status].label}`, "success");
  };

  const remove = async (order) => {
    if (!store.demoMode && hasSupabase) {
      const { error } = await supabase.from("orders").delete().eq("id", order.id);
      if (error) return toast(error.message || "Échec de la suppression", "error");
      store.reload();
    } else {
      store.setOrders((p) => p.filter((o) => o.id !== order.id));
    }
    setEditing(null);
    toast("Commande supprimée", "info");
  };

  const list = store.orders.filter((o) => filter === "ALL" || o.status === filter);

  return (
    <div>
      <h2 style={{ ...FF, fontSize: 22, fontWeight: 800, marginBottom: 14 }}>🧾 Commandes en cours</h2>
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {["ALL", "PENDING", "PREPARING", "READY"].map((f) => (
          <button key={f} onClick={() => setFilter(f)} style={{ ...FF, padding: "7px 13px", borderRadius: 10, fontWeight: 600, fontSize: 13, border: `1px solid ${filter === f ? C.text : C.border}`, background: filter === f ? C.text : C.surface, color: filter === f ? C.white : C.text }}>
            {f === "ALL" ? "Toutes" : STATUS_META[f].label}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <Surface style={{ padding: 30, textAlign: "center", color: C.textSecondary, ...FF }}>Aucune commande.</Surface>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {list.map((o) => (
            <Surface key={o.id} style={{ padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <strong style={{ ...FF }}>Table {o.table?.number ?? "?"}</strong>
                  <Tag color={STATUS_META[o.status].color}>{STATUS_META[o.status].label}</Tag>
                  <Tag color={o.order_type === "takeaway" ? C.accentPurple : C.accentBlue}>{o.order_type === "takeaway" ? "À emporter" : "Sur place"}</Tag>
                  {/* Suivi de transmission à la caisse, masqué si le restaurant
                      n'a pas d'intégration POS (statut not_applicable). */}
                  {o.pos_sync_status && o.pos_sync_status !== "not_applicable" && (
                    <Tag color={(POS_SYNC_UI[o.pos_sync_status] || POS_SYNC_UI.pending).color}>
                      Caisse : {(POS_SYNC_UI[o.pos_sync_status] || POS_SYNC_UI.pending).label}
                    </Tag>
                  )}
                </div>
                {o.pos_sync_error && (
                  <p style={{ ...FF, fontSize: 11, color: C.accent, marginTop: 3 }}>{o.pos_sync_error}</p>
                )}
                <p style={{ ...FF, fontSize: 13, color: C.textSecondary, marginTop: 4 }}>
                  {(o.items || []).map((it) => `${it.quantity}× ${it.name}`).join(", ") || o.customer_name}
                  {o.note ? ` — “${o.note}”` : ""}
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <strong style={{ ...FF }}>{eur(o.total)}</strong>
                {o.status === "PENDING" && <Btn variant="blue" size="sm" onClick={() => updateStatus(o, "PREPARING")}>Préparer</Btn>}
                {o.status === "PREPARING" && <Btn variant="green" size="sm" onClick={() => updateStatus(o, "READY")}>Prête</Btn>}
                {o.status === "READY" && <Btn variant="subtle" size="sm" onClick={() => updateStatus(o, "DONE")}>Servie</Btn>}
                <Btn variant="ghost" size="sm" title="Ticket détaillé" onClick={() => setPrinting({ ...o, detailed: true })}>🖨️</Btn>
                <Btn variant="ghost" size="sm" title="Note sans détail (justificatif)" onClick={() => setPrinting({ ...o, detailed: false })}>📄</Btn>
                <Btn variant="ghost" size="sm" title="Bon de cuisine" onClick={() => setPrinting({ ...o, kind: "kitchen" })}>🍳</Btn>
                <Btn variant="ghost" size="sm" onClick={() => setEditing(o)}>✏️</Btn>
              </div>
            </Surface>
          ))}
        </div>
      )}
      {editing && <EditOrderModal order={editing} onClose={() => setEditing(null)} onSave={updateStatus} onDelete={remove} />}
      <TicketPrintLayer job={printing} onDone={() => setPrinting(null)} restaurant={restaurant} settings={settings} />
    </div>
  );
}

function EditOrderModal({ order, onClose, onSave, onDelete }) {
  const [status, setStatus] = useState(order.status);
  const [note, setNote] = useState(order.note || "");
  return (
    <Modal onClose={onClose}>
      <div style={{ padding: 22 }}>
        <h3 style={{ ...FF, marginBottom: 16 }}>Commande — Table {order.table?.number}</h3>
        <span style={{ ...FF, fontSize: 13, fontWeight: 600, color: C.textSecondary }}>Statut</span>
        <div style={{ display: "flex", gap: 6, margin: "8px 0 16px", flexWrap: "wrap" }}>
          {Object.keys(STATUS_META).map((s) => (
            <button key={s} onClick={() => setStatus(s)} style={{ ...FF, padding: "7px 12px", borderRadius: 10, fontSize: 13, fontWeight: 600, border: `1px solid ${status === s ? STATUS_META[s].color : C.border}`, background: status === s ? `${STATUS_META[s].color}1A` : C.surface, color: status === s ? STATUS_META[s].color : C.text }}>
              {STATUS_META[s].label}
            </button>
          ))}
        </div>
        <InputField label="Note" value={note} onChange={(e) => setNote(e.target.value)} />
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <Btn variant="primary" style={{ flex: 1 }} onClick={() => { onSave({ ...order, note }, status); onClose(); }}>Enregistrer</Btn>
          <Btn variant="red" onClick={() => onDelete(order)}>Supprimer</Btn>
        </div>
      </div>
    </Modal>
  );
}

/* ---- Register / Caisse ---- */
/* ============================================================================
 * PRISE DE COMMANDE AU COMPTOIR
 *
 * Terminal de vente pour le personnel : on tape les articles, on choisit la
 * table (ou À emporter), on encaisse. La commande part directement en vue
 * cuisine comme une commande QR code.
 *
 * Volontairement AUCUN appel à Stripe ni à la caisse externe : l'encaissement
 * est physique et le personnel est déjà au comptoir. La commande est donc
 * marquée pay_at_counter / not_applicable — inutile de la renvoyer vers un
 * système de caisse devant lequel on se trouve.
 * ==========================================================================*/
function PosTab({ restaurant, store }) {
  const toast = useToast();
  const isMobile = useIsMobile();
  const settings = useRestaurantSettings(restaurant.id, store.demoMode);
  const [cat, setCat] = useState("ALL");
  const [lines, setLines] = useState([]); // { key, item, qty }
  const [tableId, setTableId] = useState("");
  const [busy, setBusy] = useState(false);
  // File plutôt qu'un simple job unique : chaque encaissement imprime le
  // ticket client puis le bon de cuisine juste derrière, l'un après l'autre.
  const [printQueue, setPrintQueue] = useState([]);
  const printing = printQueue[0] ?? null;
  const [printDetailed, setPrintDetailed] = useState(true);

  const available = store.menu.filter((m) => m.available !== false);
  const cats = ["ALL", ...new Set(available.map((m) => m.category).filter(Boolean))];
  const shown = cat === "ALL" ? available : available.filter((m) => m.category === cat);

  // La table 0 sert de "vente à emporter" (créée par le seed avec les autres).
  const sortedTables = [...store.tables].sort((a, b) => a.number - b.number);
  const total = lines.reduce((s, l) => s + Number(l.item.price) * l.qty, 0);
  const count = lines.reduce((s, l) => s + l.qty, 0);

  const add = (item) => {
    setLines((p) => {
      // Même article tapé deux fois : on incrémente au lieu d'empiler.
      const i = p.findIndex((l) => l.item.id === item.id);
      if (i >= 0) {
        const next = [...p];
        next[i] = { ...next[i], qty: next[i].qty + 1 };
        return next;
      }
      return [...p, { key: uid(), item, qty: 1 }];
    });
  };

  const bump = (key, delta) => {
    setLines((p) =>
      p.map((l) => (l.key === key ? { ...l, qty: l.qty + delta } : l)).filter((l) => l.qty > 0),
    );
  };

  const removeLine = (key) => setLines((p) => p.filter((l) => l.key !== key));

  // Le ticket imprimé au comptoir est construit à partir du panier tel qu'il
  // est au moment de valider, pas de la commande relue en base ensuite : le
  // personnel doit avoir son papier immédiatement, sans attendre un aller-retour.
  // `res` est la réponse de create_order_secure : montants, numéro fiscal et
  // ventilation de TVA font autorité et sont repris tels quels sur le ticket.
  // En mode démo il est absent, on retombe alors sur le panier local.
  const buildTicketJob = (res, method) => {
    const table = sortedTables.find((t) => t.id === tableId);
    // En démo il n'y a pas de passage en base : on reconstitue la ventilation
    // localement pour que l'aperçu du ticket soit fidèle au ticket réel.
    const demoVat = () => {
      const byRate = new Map();
      lines.forEach((l) => {
        const rate = Number(l.item.vat_rate ?? 10);
        byRate.set(rate, (byRate.get(rate) || 0) + Number(l.item.price) * l.qty);
      });
      return [...byRate.entries()].sort((a, b) => a[0] - b[0]).map(([rate, ttc]) => {
        const ht = ttc / (1 + rate / 100);
        return {
          rate,
          base_ht: Math.round(ht * 100) / 100,
          vat: Math.round((ttc - ht) * 100) / 100,
          total_ttc: Math.round(ttc * 100) / 100,
        };
      });
    };
    return {
      id: res?.order_id || uid(),
      created_at: new Date().toISOString(),
      fiscal_number: res?.fiscal_number || null,
      order_type: table?.number === 0 ? "takeaway" : "dine_in",
      table: table ? { number: table.number, label: table.label } : null,
      customer_name: "Comptoir",
      items: lines.map((l) => ({ quantity: l.qty, name: l.item.name, price: l.item.price, detail: "" })),
      subtotal: res?.subtotal ?? total,
      discount: res?.discount ?? 0,
      total: res?.total ?? total,
      vat_breakdown: res?.vat_breakdown || demoVat(),
      payment_method: method,
      payment_mode: "pay_at_counter",
      note: "",
      detailed: printDetailed,
    };
  };

  const validate = async (method) => {
    if (!lines.length) return toast("Le ticket est vide", "error");
    if (!tableId) return toast("Choisis une table", "error");
    setBusy(true);
    try {
      if (store.demoMode || !hasSupabase) {
        const job = buildTicketJob(null, method);
        await new Promise((r) => setTimeout(r, 400));
        toast(`(Démo) Commande de ${eur(total)} enregistrée`, "success");
        setLines([]);
        setPrintQueue((q) => [...q, job, { ...job, kind: "kitchen" }]);
        return;
      }
      const table = sortedTables.find((t) => t.id === tableId);
      // Une vente au comptoir est un encaissement au même titre qu'une commande
      // QR : elle doit être numérotée et inscrite au journal fiscal. On passe
      // donc par la même transaction que le flux client.
      const { data: res, error } = await supabase.rpc("create_order_secure", {
        p_restaurant: restaurant.id,
        p_table: tableId,
        p_order_type: table?.number === 0 ? "takeaway" : "dine_in",
        p_payment_method: method,
        p_payment_mode: "pay_at_counter",
        p_customer_name: "Comptoir",
        p_customer_email: "",
        p_note: "",
        p_promo_code: null,
        p_items: lines.map((l) => ({ menu_item_id: l.item.id, quantity: l.qty, detail: "" })),
        p_client_token: uid(),
      });
      if (error) throw error;

      // L'argent est encaissé sur-le-champ : on marque la commande réglée et
      // on n'a rien à transmettre à une caisse externe devant laquelle on est.
      await supabase.from("orders")
        .update({ cash_collected: true, pos_sync_status: "not_applicable" })
        .eq("id", res.order_id);

      const job = buildTicketJob(res, method);
      toast(`Commande envoyée en cuisine — ${eur(res.total)}`, "success");
      setLines([]);
      setPrintQueue((q) => [...q, job, { ...job, kind: "kitchen" }]);
      store.reload();
    } catch (e) {
      const msg = String(e?.message || "");
      if (msg.includes("rupture_stock")) {
        toast(`Stock épuisé : ${msg.split("rupture_stock:")[1]?.trim() || "article"}`, "error");
      } else {
        toast(msg || "Erreur", "error");
      }
    } finally {
      setBusy(false);
    }
  };

  const checkoutBar = (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "10px 0" }}>
        <span style={{ ...FF, fontWeight: 700 }}>Total {count > 0 && `(${count})`}</span>
        <strong style={{ ...FF, fontSize: 26, fontWeight: 900 }}>{eur(total)}</strong>
      </div>
      {/* Un client en déplacement professionnel demande parfois une note sans
          le détail des plats (justificatif de note de frais) plutôt que le
          ticket détaillé habituel. */}
      <label style={{ ...FF, display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.textSecondary, marginBottom: 10 }}>
        <input type="checkbox" checked={printDetailed} onChange={(e) => setPrintDetailed(e.target.checked)} />
        Ticket détaillé (décocher pour une note sans le détail des plats)
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <Btn variant="primary" size="lg" style={{ flex: 1, minHeight: 58, fontSize: 17 }} disabled={busy || !lines.length} onClick={() => validate("cash")}>
          💵 Espèces
        </Btn>
        <Btn variant="blue" size="lg" style={{ flex: 1, minHeight: 58, fontSize: 17 }} disabled={busy || !lines.length} onClick={() => validate("card")}>
          💳 Carte
        </Btn>
      </div>
    </div>
  );

  const ticket = (
    <Surface style={{ padding: 16, position: isMobile ? "static" : "sticky", top: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <strong style={{ ...FF, fontSize: 16 }}>🧾 Ticket</strong>
        {lines.length > 0 && (
          <button onClick={() => setLines([])} style={{ ...FF, fontSize: 13, color: C.accent, padding: "6px 4px" }}>
            Vider
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, marginBottom: 14 }}>
        {sortedTables.map((t) => {
          const selected = tableId === t.id;
          const label = t.number === 0 ? "🥡 À emporter" : `🍽️ ${t.label || `Table ${t.number}`}`;
          return (
            <button
              key={t.id}
              onClick={() => setTableId(t.id)}
              style={{ ...FF, flexShrink: 0, whiteSpace: "nowrap", padding: "10px 16px", borderRadius: 999, fontWeight: 700, fontSize: 14, border: `2px solid ${selected ? C.accentBlue : C.border}`, background: selected ? C.accentBlue : C.surface, color: selected ? C.white : C.text }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {lines.length === 0 ? (
        <p style={{ ...FF, color: C.textTertiary, fontSize: 14, textAlign: "center", padding: "20px 0" }}>
          Touche un article pour l'ajouter
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12, maxHeight: isMobile ? "none" : "40vh", overflowY: "auto" }}>
          {lines.map((l) => (
            <div key={l.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...FF, fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {l.item.emoji} {l.item.name}
                </div>
                <div style={{ ...FF, fontSize: 12, color: C.textSecondary }}>
                  {eur(Number(l.item.price) * l.qty)}
                </div>
              </div>
              <button onClick={() => bump(l.key, -1)} style={{ ...FF, width: 38, height: 38, borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 20, fontWeight: 700 }}>−</button>
              <span style={{ ...FF, minWidth: 24, textAlign: "center", fontWeight: 700, fontSize: 15 }}>{l.qty}</span>
              <button onClick={() => bump(l.key, 1)} style={{ ...FF, width: 38, height: 38, borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 20, fontWeight: 700 }}>+</button>
              <button onClick={() => removeLine(l.key)} style={{ ...FF, width: 38, height: 38, borderRadius: 10, border: "none", background: "transparent", fontSize: 16, color: C.textTertiary }}>🗑️</button>
            </div>
          ))}
        </div>
      )}

      {!isMobile && (
        <div style={{ borderTop: `1px solid ${C.border}` }}>
          {checkoutBar}
          <p style={{ ...FF, fontSize: 11, color: C.textTertiary, marginTop: 4, textAlign: "center" }}>
            Encaissement au comptoir — la commande part en cuisine.
          </p>
        </div>
      )}
    </Surface>
  );

  return (
    <div style={{ paddingBottom: isMobile ? 160 : 0 }}>
      <style>{`.wgm-pos-tile:active { transform: scale(0.95); box-shadow: 0 0 0 2px ${C.accentBlue} inset; }`}</style>
      <h2 style={{ ...FF, fontSize: 22, fontWeight: 800, marginBottom: 4 }}>🛒 Prise de commande</h2>
      <p style={{ ...FF, fontSize: 13, color: C.textSecondary, marginBottom: 16 }}>
        Pour les clients qui commandent directement au comptoir.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "minmax(0, 1fr) 340px", gap: 16, alignItems: "start" }}>
        <div>
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 10, marginBottom: 4 }}>
            {cats.map((c) => (
              <button
                key={c}
                onClick={() => setCat(c)}
                style={{ ...FF, flexShrink: 0, whiteSpace: "nowrap", padding: "9px 16px", borderRadius: 999, fontWeight: 600, fontSize: 14, border: `1px solid ${cat === c ? C.text : C.border}`, background: cat === c ? C.text : C.surface, color: cat === c ? C.white : C.text }}
              >
                {c === "ALL" ? "Tout" : c}
              </button>
            ))}
          </div>

          {shown.length === 0 ? (
            <Surface style={{ padding: 30, textAlign: "center", ...FF, color: C.textSecondary }}>
              Aucun article dans la carte.
            </Surface>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 128 : 152}px, 1fr))`, gap: 10 }}>
              {shown.map((m) => {
                const out = m.stock != null && Number(m.stock) <= 0;
                const inCart = lines.find((l) => l.item.id === m.id)?.qty;
                return (
                  <button
                    key={m.id}
                    disabled={out}
                    onClick={() => add(m)}
                    className="wgm-pos-tile"
                    style={{ ...FF, position: "relative", textAlign: "left", padding: 14, borderRadius: 16, border: `2px solid ${inCart ? C.accentBlue : C.border}`, background: C.surface, opacity: out ? 0.45 : 1, minHeight: 108, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 8, transition: "transform .1s ease, box-shadow .1s ease" }}
                  >
                    {inCart > 0 && (
                      <span style={{ position: "absolute", top: -8, right: -8, background: C.accentBlue, color: C.white, borderRadius: 999, minWidth: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, padding: "0 6px" }}>
                        {inCart}
                      </span>
                    )}
                    <span style={{ fontSize: 26, lineHeight: 1 }}>{m.emoji || "🍽️"}</span>
                    <span style={{ ...FF, fontSize: 14, fontWeight: 700, lineHeight: 1.25 }}>{m.name}</span>
                    <strong style={{ ...FF, fontSize: 15, color: out ? C.textTertiary : C.accentGreen }}>
                      {out ? "Épuisé" : eur(m.price)}
                    </strong>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {ticket}
      </div>

      {isMobile && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: C.surface, borderTop: `1px solid ${C.border}`, padding: "10px 16px calc(10px + env(safe-area-inset-bottom))", zIndex: 60, boxShadow: "0 -4px 16px rgba(0,0,0,.08)" }}>
          {checkoutBar}
        </div>
      )}

      <TicketPrintLayer job={printing} onDone={() => setPrintQueue((q) => q.slice(1))} restaurant={restaurant} settings={settings} />
    </div>
  );
}

function RegisterTab({ restaurant, store }) {
  const toast = useToast();
  const all = [...store.orders, ...store.doneOrders];
  const revenue = all.reduce((s, o) => s + Number(o.total || 0), 0);
  const byMethod = all.reduce((acc, o) => {
    const m = o.payment_method || "cash";
    acc[m] = (acc[m] || 0) + Number(o.total || 0);
    return acc;
  }, {});
  const cashPending = all.filter((o) => o.payment_method === "cash" && !o.cash_collected);

  const methodLabels = { cash: "💵 Espèces", card: "💳 Carte", apple_pay: " Apple Pay", google_pay: "🅖 Google Pay" };

  const exportCSV = () => {
    const rows = [["id", "table", "total", "paiement", "encaissé", "date"], ...all.map((o) => [o.id, o.table?.number ?? "", o.total, o.payment_method, o.cash_collected ? "oui" : "non", o.created_at])];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `caisse-${restaurant.slug}.csv`;
    a.click();
    toast("Export CSV téléchargé", "success");
  };

  const collectCash = async (o) => {
    if (!store.demoMode && hasSupabase) {
      const { error } = await supabase.from("orders").update({ cash_collected: true }).eq("id", o.id);
      if (error) return toast(error.message || "Échec de l'enregistrement", "error");
      store.reload();
    } else {
      store.setOrders((p) => p.map((x) => (x.id === o.id ? { ...x, cash_collected: true } : x)));
    }
    toast("Encaissé ✓", "success");
  };

  return (
    <div>
      <h2 style={{ ...FF, fontSize: 22, fontWeight: 800, marginBottom: 16 }}>💶 Caisse</h2>
      <Surface style={{ padding: 20, marginBottom: 16 }}>
        <span style={{ ...FF, color: C.textSecondary, fontSize: 14 }}>CA du jour</span>
        <div style={{ ...FF, fontSize: 34, fontWeight: 900, color: C.accentGreen }}>{eur(revenue)}</div>
      </Surface>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 16 }}>
        {Object.entries(byMethod).map(([m, v]) => (
          <Surface key={m} style={{ padding: 14 }}>
            <span style={{ ...FF, fontSize: 13, color: C.textSecondary }}>{methodLabels[m] || m}</span>
            <div style={{ ...FF, fontSize: 20, fontWeight: 800 }}>{eur(v)}</div>
          </Surface>
        ))}
      </div>
      {cashPending.length > 0 && (
        <Surface style={{ padding: 16, marginBottom: 16 }}>
          <strong style={{ ...FF }}>Espèces à encaisser</strong>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            {cashPending.map((o) => (
              <div key={o.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ ...FF, fontSize: 14 }}>Table {o.table?.number} — {eur(o.total)} <Tag color={C.accentOrange}>non encaissé</Tag></span>
                <Btn variant="green" size="sm" onClick={() => collectCash(o)}>Encaisser</Btn>
              </div>
            ))}
          </div>
        </Surface>
      )}
      <div style={{ display: "flex", gap: 10 }}>
        <Btn variant="subtle" onClick={exportCSV}>⬇️ Export CSV</Btn>
        <Btn variant="primary" onClick={() => window.print()}>🖨️ Rapport Z</Btn>
      </div>
    </div>
  );
}

/* ---- QR Codes ---- */
function QRTab({ restaurant, store }) {
  const toast = useToast();
  const isHotel = restaurant.vertical === "hotel" || restaurant.id === "demo-hotel";
  const unit = isHotel ? "Chambre" : "Table";
  const origin = window.location.origin + (import.meta.env.VITE_BASE_PATH && import.meta.env.VITE_BASE_PATH !== "/" ? import.meta.env.VITE_BASE_PATH.replace(/\/$/, "") : "");
  const [fg, setFg] = useState("#1D1D1F");
  const [bg, setBg] = useState("#FFFFFF");
  const canvasRefs = useRef({});
  const [embed, setEmbed] = useState({ color: "#1D1D1F", textColor: "#ffffff", label: "🛒 Commander", table: 0 });

  const download = (num) => {
    const canvas = canvasRefs.current[num];
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `qr-${restaurant.slug}-${isHotel ? "chambre" : "table"}-${num}.png`;
    a.click();
    toast("QR téléchargé", "success");
  };

  const snippet = `<div data-wegemo="${restaurant.slug}" data-table="${embed.table}" data-label="${embed.label}" data-color="${embed.color}" data-text-color="${embed.textColor}" data-name="${restaurant.name}"></div>\n<script src="${origin}/embed.js"></script>`;

  return (
    <div>
      <h2 style={{ ...FF, fontSize: 22, fontWeight: 800, marginBottom: 14 }}>🔳 QR Codes par {unit.toLowerCase()}</h2>
      {isHotel && (
        <p style={{ ...FF, fontSize: 13, color: C.textSecondary, marginBottom: 14 }}>
          Collez le QR sur la porte ou le bureau de chaque chambre : le client accède au <b>portail chambre</b> — check-in en ligne, room service, services de l'hôtel et bons plans autour.
        </p>
      )}
      <Surface style={{ padding: 16, marginBottom: 16, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ ...FF, fontSize: 13 }}>Couleur <input type="color" value={fg} onChange={(e) => setFg(e.target.value)} /></label>
        <label style={{ ...FF, fontSize: 13 }}>Fond <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} /></label>
      </Surface>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 14, marginBottom: 24 }}>
        {store.tables.map((tb) => {
          const url = `${origin}/r/${restaurant.slug}/t/${tb.number}`;
          return (
            <Surface key={tb.id} style={{ padding: 16, textAlign: "center" }}>
              <strong style={{ ...FF }}>{tb.label || `${unit} ${tb.number}`}</strong>
              <div style={{ display: "flex", justifyContent: "center", margin: "10px 0" }}>
                <QRCanvas value={url} size={150} fg={fg} bg={bg} onReady={(c) => (canvasRefs.current[tb.number] = c)} />
              </div>
              <TableLabelEditor table={tb} store={store} />
              <Btn variant="subtle" size="sm" style={{ width: "100%", marginTop: 6 }} onClick={() => download(tb.number)}>⬇️ PNG</Btn>
            </Surface>
          );
        })}
      </div>

      <Surface style={{ padding: 20 }}>
        <strong style={{ ...FF }}>🌐 Intégration sur votre site web</strong>
        <p style={{ ...FF, fontSize: 13, color: C.textSecondary, margin: "6px 0 12px" }}>Ajoutez un bouton de commande sur votre site existant.</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <label style={{ ...FF, fontSize: 13 }}>Couleur <input type="color" value={embed.color} onChange={(e) => setEmbed({ ...embed, color: e.target.value })} /></label>
          <label style={{ ...FF, fontSize: 13 }}>Texte <input type="color" value={embed.textColor} onChange={(e) => setEmbed({ ...embed, textColor: e.target.value })} /></label>
          <input value={embed.label} onChange={(e) => setEmbed({ ...embed, label: e.target.value })} style={{ ...FF, padding: "8px 10px", borderRadius: 9, border: `1px solid ${C.border}` }} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <span style={{ ...FF, fontSize: 12, color: C.textSecondary }}>Aperçu :</span>{" "}
          <button style={{ ...FF, padding: "12px 20px", borderRadius: 999, background: embed.color, color: embed.textColor, fontWeight: 700, marginLeft: 8 }}>{embed.label}</button>
        </div>
        <pre style={{ ...FF, background: C.dark, color: "#E5E5EA", padding: 14, borderRadius: 12, fontSize: 12, overflow: "auto", whiteSpace: "pre-wrap" }}>{snippet}</pre>
        <Btn variant="subtle" size="sm" style={{ marginTop: 10 }} onClick={() => { navigator.clipboard?.writeText(snippet); toast("Snippet copié !", "success"); }}>📋 Copier</Btn>
      </Surface>
    </div>
  );
}

function TableLabelEditor({ table, store }) {
  const toast = useToast();
  const [label, setLabel] = useState(table.label || "");
  const save = async () => {
    if (!store.demoMode && hasSupabase) {
      const { error } = await supabase.from("tables").update({ label: label || null }).eq("id", table.id);
      if (error) return toast(error.message || "Échec de l'enregistrement", "error");
      store.reload();
    }
    toast("Nom de table enregistré", "success");
  };
  return (
    <div style={{ display: "flex", gap: 4 }}>
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={`Table ${table.number}`} style={{ ...FF, flex: 1, padding: "6px 8px", fontSize: 12, borderRadius: 8, border: `1px solid ${C.border}`, minWidth: 0 }} />
      <Btn variant="subtle" size="xs" onClick={save}>✓</Btn>
    </div>
  );
}

/* ---- Inventory ---- */
function InventoryTab({ restaurant, store }) {
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", unit: "kg", emoji: "📦", stock: 0, alert_threshold: "" });

  const adjust = async (ing, delta) => {
    const newStock = Math.max(0, Number(ing.stock) + delta);
    if (!store.demoMode && hasSupabase) {
      const { error } = await supabase.from("ingredients").update({ stock: newStock }).eq("id", ing.id);
      if (error) return toast(error.message || "Échec de la mise à jour du stock", "error");
      store.reload();
    } else {
      store.setIngredients((p) => p.map((i) => (i.id === ing.id ? { ...i, stock: newStock } : i)));
    }
  };

  const add = async (e) => {
    e.preventDefault();
    const row = { ...form, restaurant_id: restaurant.id, stock: Number(form.stock), alert_threshold: form.alert_threshold === "" ? null : Number(form.alert_threshold) };
    if (!store.demoMode && hasSupabase) {
      const { error } = await supabase.from("ingredients").insert(row);
      if (error) return toast(error.message || "Échec de l'ajout", "error");
      store.reload();
    } else {
      store.setIngredients((p) => [...p, { ...row, id: uid() }]);
    }
    setAdding(false);
    setForm({ name: "", unit: "kg", emoji: "📦", stock: 0, alert_threshold: "" });
    toast("Ingrédient ajouté", "success");
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ ...FF, fontSize: 22, fontWeight: 800 }}>📦 Inventaire</h2>
        <Btn variant="primary" onClick={() => setAdding((v) => !v)}>+ Ingrédient</Btn>
      </div>
      {adding && (
        <Surface style={{ padding: 18, marginBottom: 16 }}>
          <form onSubmit={add} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: "1 1 140px" }}><InputField label="Nom" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
            <InputField label="Emoji" value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })} style={{ width: 70 }} />
            <InputField label="Unité" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} style={{ width: 80 }} />
            <InputField label="Stock" type="number" step="0.001" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} style={{ width: 90 }} />
            <InputField label="Seuil alerte" type="number" step="0.001" value={form.alert_threshold} onChange={(e) => setForm({ ...form, alert_threshold: e.target.value })} style={{ width: 100 }} />
            <Btn type="submit" variant="primary">Ajouter</Btn>
          </form>
        </Surface>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {store.ingredients.map((ing) => {
          const low = ing.alert_threshold != null && Number(ing.stock) <= Number(ing.alert_threshold);
          return (
            <Surface key={ing.id} style={{ padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center", borderColor: low ? `${C.accent}55` : C.border }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 22 }}>{ing.emoji}</span>
                <div>
                  <strong style={{ ...FF }}>{ing.name}</strong>
                  {low && <Tag color={C.accent}>⚠️ Stock bas</Tag>}
                  <div style={{ ...FF, fontSize: 13, color: C.textSecondary }}>{ing.stock} {ing.unit}{ing.alert_threshold != null ? ` · seuil ${ing.alert_threshold}` : ""}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <Btn variant="subtle" size="sm" onClick={() => adjust(ing, -1)}>−</Btn>
                <Btn variant="subtle" size="sm" onClick={() => adjust(ing, 1)}>+</Btn>
              </div>
            </Surface>
          );
        })}
      </div>
    </div>
  );
}

/* ---- Promos ---- */
function PromosTab({ restaurant, store }) {
  const toast = useToast();
  const [sub, setSub] = useState("promos");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", discount_percent: 10, emoji: "🎁", color: "#FF9F0A", type: "event" });

  const add = async (e) => {
    e.preventDefault();
    const row = { ...form, restaurant_id: restaurant.id, discount_percent: Number(form.discount_percent), active: true };
    if (!store.demoMode && hasSupabase) {
      const { error } = await supabase.from("promotions").insert(row);
      if (error) return toast(error.message || "Échec de la création", "error");
      store.reload();
    } else {
      store.setPromos((p) => [...p, { ...row, id: uid(), send_count: 0 }]);
    }
    setAdding(false);
    toast("Promotion créée", "success");
  };

  return (
    <div>
      <h2 style={{ ...FF, fontSize: 22, fontWeight: 800, marginBottom: 14 }}>🎁 Promotions</h2>
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {[["promos", "Promotions"], ["codes", "Codes promo"], ["calendar", "Calendrier"]].map(([id, lbl]) => (
          <button key={id} onClick={() => setSub(id)} style={{ ...FF, padding: "7px 13px", borderRadius: 10, fontWeight: 600, fontSize: 13, border: `1px solid ${sub === id ? C.text : C.border}`, background: sub === id ? C.text : C.surface, color: sub === id ? C.white : C.text }}>{lbl}</button>
        ))}
      </div>

      {sub === "promos" && (
        <>
          <Btn variant="primary" style={{ marginBottom: 14 }} onClick={() => setAdding((v) => !v)}>+ Nouvelle promo</Btn>
          {adding && (
            <Surface style={{ padding: 18, marginBottom: 16 }}>
              <form onSubmit={add}>
                <InputField label="Nom" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                <InputField label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                <div style={{ display: "flex", gap: 10 }}>
                  <InputField label="Réduction %" type="number" value={form.discount_percent} onChange={(e) => setForm({ ...form, discount_percent: e.target.value })} style={{ width: 100 }} />
                  <InputField label="Emoji" value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })} style={{ width: 70 }} />
                  <label style={{ ...FF, fontSize: 13 }}>Couleur<br /><input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} /></label>
                </div>
                <Btn type="submit" variant="primary">Créer</Btn>
              </form>
            </Surface>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
            {store.promos.map((p) => (
              <Surface key={p.id} style={{ padding: 16, borderLeft: `4px solid ${p.color}` }}>
                <div style={{ fontSize: 26 }}>{p.emoji}</div>
                <strong style={{ ...FF }}>{p.name}</strong>
                <p style={{ ...FF, fontSize: 13, color: C.textSecondary }}>{p.description}</p>
                {p.discount_percent > 0 && <Tag color={p.color}>-{p.discount_percent}%</Tag>}
              </Surface>
            ))}
          </div>
        </>
      )}

      {sub === "codes" && <PromoCodes restaurant={restaurant} store={store} />}

      {sub === "calendar" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
          {SEASONAL_EVENTS.map((ev) => (
            <Surface key={ev.id} style={{ padding: 16, cursor: "pointer", borderLeft: `4px solid ${ev.color}` }} onClick={() => { setForm({ name: ev.name, description: ev.idea, discount_percent: 10, emoji: ev.emoji, color: ev.color, type: "seasonal" }); setSub("promos"); setAdding(true); }}>
              <div style={{ fontSize: 24 }}>{ev.emoji}</div>
              <strong style={{ ...FF, fontSize: 15 }}>{ev.name}</strong>
              <div style={{ ...FF, fontSize: 12, color: C.textTertiary }}>{ev.date}</div>
              <p style={{ ...FF, fontSize: 12, color: C.textSecondary, marginTop: 4 }}>{ev.idea}</p>
            </Surface>
          ))}
        </div>
      )}
    </div>
  );
}

function PromoCodes({ restaurant, store }) {
  const toast = useToast();
  const [codes, setCodes] = useState([]);
  const [form, setForm] = useState({ code: "", discount_percent: 10, discount_amount: "", max_uses: "" });

  useEffect(() => {
    if (store.demoMode || !hasSupabase) {
      setCodes([{ id: "pc1", code: "BIENVENUE10", discount_percent: 10, use_count: 4, max_uses: 100 }]);
      return;
    }
    supabase.from("promo_codes").select("*").eq("restaurant_id", restaurant.id).then(({ data }) => setCodes(data || []));
  }, [restaurant.id, store.demoMode]);

  const add = async (e) => {
    e.preventDefault();
    const row = {
      restaurant_id: restaurant.id, code: form.code.toUpperCase(),
      discount_percent: form.discount_percent === "" ? null : Number(form.discount_percent),
      discount_amount: form.discount_amount === "" ? null : Number(form.discount_amount),
      max_uses: form.max_uses === "" ? null : Number(form.max_uses), active: true,
    };
    if (!store.demoMode && hasSupabase) {
      const { data } = await supabase.from("promo_codes").insert(row).select().single();
      if (data) setCodes((p) => [...p, data]);
    } else {
      setCodes((p) => [...p, { ...row, id: uid(), use_count: 0 }]);
    }
    setForm({ code: "", discount_percent: 10, discount_amount: "", max_uses: "" });
    toast("Code promo créé", "success");
  };

  return (
    <div>
      <Surface style={{ padding: 18, marginBottom: 16 }}>
        <form onSubmit={add} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <InputField label="Code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required style={{ textTransform: "uppercase" }} />
          <InputField label="% réduc" type="number" value={form.discount_percent} onChange={(e) => setForm({ ...form, discount_percent: e.target.value, discount_amount: "" })} style={{ width: 90 }} />
          <InputField label="ou montant €" type="number" value={form.discount_amount} onChange={(e) => setForm({ ...form, discount_amount: e.target.value, discount_percent: "" })} style={{ width: 110 }} />
          <InputField label="Usages max" type="number" value={form.max_uses} onChange={(e) => setForm({ ...form, max_uses: e.target.value })} style={{ width: 100 }} />
          <Btn type="submit" variant="primary">Créer</Btn>
        </form>
      </Surface>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {codes.map((c) => (
          <Surface key={c.id} style={{ padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <strong style={{ ...FF, fontFamily: "monospace" }}>{c.code}</strong>{" "}
              <Tag color={C.accentGreen}>{c.discount_percent ? `-${c.discount_percent}%` : `-${eur(c.discount_amount)}`}</Tag>
            </div>
            <span style={{ ...FF, fontSize: 13, color: C.textSecondary }}>{c.use_count}{c.max_uses ? `/${c.max_uses}` : ""} utilisations</span>
          </Surface>
        ))}
      </div>
    </div>
  );
}

/* ---- Menu ---- */
function MenuTab({ restaurant, store }) {
  const toast = useToast();
  const [editing, setEditing] = useState(null);
  const blank = { name: "", description: "", price: 0, category: "Plats", emoji: "🍴", is_popular: false, available: true, stock: "", vat_rate: 10, supplements: [], extras: [] };

  const save = async (item) => {
    const row = {
      ...item, restaurant_id: restaurant.id, price: Number(item.price),
      stock: item.stock === "" || item.stock == null ? null : Number(item.stock),
      vat_rate: item.vat_rate == null || item.vat_rate === "" ? 10 : Number(item.vat_rate),
    };
    if (!store.demoMode && hasSupabase) {
      const { error } = item.id
        ? await supabase.from("menu_items").update(row).eq("id", item.id)
        : await supabase.from("menu_items").insert(row);
      if (error) return toast(error.message || "Échec de l'enregistrement", "error");
      store.reload();
    } else {
      store.setMenu((p) => (item.id ? p.map((m) => (m.id === item.id ? row : m)) : [...p, { ...row, id: uid() }]));
    }
    setEditing(null);
    toast("Plat enregistré", "success");
  };

  const remove = async (item) => {
    if (!store.demoMode && hasSupabase) {
      const { error } = await supabase.from("menu_items").delete().eq("id", item.id);
      if (error) return toast(error.message || "Échec de la suppression", "error");
      store.reload();
    } else {
      store.setMenu((p) => p.filter((m) => m.id !== item.id));
    }
    setEditing(null);
    toast("Plat supprimé", "info");
  };

  const cats = [...new Set(store.menu.map((m) => m.category))];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ ...FF, fontSize: 22, fontWeight: 800 }}>🍽️ Carte</h2>
        <Btn variant="primary" onClick={() => setEditing(blank)}>+ Plat</Btn>
      </div>
      {cats.map((cat) => (
        <div key={cat} style={{ marginBottom: 18 }}>
          <h3 style={{ ...FF, fontSize: 15, fontWeight: 700, color: C.textSecondary, marginBottom: 8 }}>{cat}</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
            {store.menu.filter((m) => m.category === cat).map((m) => (
              <Surface key={m.id} style={{ padding: 14, cursor: "pointer", opacity: m.available ? 1 : 0.5 }} onClick={() => setEditing(m)}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 24 }}>{m.emoji}</span>
                  <strong style={{ ...FF }}>{eur(m.price)}</strong>
                </div>
                <strong style={{ ...FF, display: "block", marginTop: 6 }}>{m.name}</strong>
                <p style={{ ...FF, fontSize: 12, color: C.textSecondary }}>{m.description}</p>
                <div style={{ marginTop: 6, display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {m.is_popular && <Tag color={C.accent}>★ Populaire</Tag>}
                  {!m.available && <Tag color={C.textTertiary}>Indisponible</Tag>}
                  {m.stock != null && <Tag color={C.accentOrange}>Stock {m.stock}</Tag>}
                </div>
              </Surface>
            ))}
          </div>
        </div>
      ))}
      {editing && <MenuItemModal item={editing} onClose={() => setEditing(null)} onSave={save} onDelete={remove} />}
    </div>
  );
}

function MenuItemModal({ item, onClose, onSave, onDelete }) {
  const [f, setF] = useState({ ...item, stock: item.stock ?? "", supplements: item.supplements || [], extras: item.extras || [] });
  const setSup = (i, k, v) => setF((p) => ({ ...p, supplements: p.supplements.map((s, idx) => (idx === i ? { ...s, [k]: v } : s)) }));
  return (
    <Modal onClose={onClose} width={500}>
      <div style={{ padding: 22 }}>
        <h3 style={{ ...FF, marginBottom: 16 }}>{item.id ? "Modifier" : "Nouveau"} plat</h3>
        <div style={{ display: "flex", gap: 10 }}>
          <InputField label="Emoji" value={f.emoji} onChange={(e) => setF({ ...f, emoji: e.target.value })} style={{ width: 70 }} />
          <div style={{ flex: 1 }}><InputField label="Nom" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        </div>
        <InputField label="Description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <div style={{ display: "flex", gap: 10 }}>
          <InputField label="Prix €" type="number" step="0.01" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} style={{ width: 100 }} />
          <div style={{ flex: 1 }}><InputField label="Catégorie" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} /></div>
          <InputField label="Stock (vide=∞)" type="number" value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value })} style={{ width: 110 }} />
          {/* Taux de TVA : 10 % en restauration, 20 % sur l'alcool, 5,5 % sur
              l'alimentaire à emporter conditionné. Figé sur le ticket à la
              vente, donc modifiable ici sans réécrire l'historique. */}
          <label style={{ ...FF, display: "flex", flexDirection: "column", gap: 4, fontSize: 13, fontWeight: 600, color: C.textSecondary }}>
            TVA
            <select
              value={f.vat_rate ?? 10}
              onChange={(e) => setF({ ...f, vat_rate: Number(e.target.value) })}
              style={{ ...FF, padding: "10px 12px", borderRadius: 12, border: `1px solid ${C.border}`, background: C.surface, fontSize: 15, width: 110 }}
            >
              <option value={10}>10 %</option>
              <option value={20}>20 % (alcool)</option>
              <option value={5.5}>5,5 %</option>
              <option value={0}>0 %</option>
            </select>
          </label>
        </div>
        <div style={{ display: "flex", gap: 16, margin: "8px 0 14px" }}>
          <label style={{ ...FF, fontSize: 14, display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={f.is_popular} onChange={(e) => setF({ ...f, is_popular: e.target.checked })} /> Populaire
          </label>
          <label style={{ ...FF, fontSize: 14, display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={f.available} onChange={(e) => setF({ ...f, available: e.target.checked })} /> Disponible
          </label>
        </div>
        <div style={{ marginBottom: 14 }}>
          <span style={{ ...FF, fontSize: 13, fontWeight: 600, color: C.textSecondary }}>Suppléments payants</span>
          {f.supplements.map((s, i) => (
            <div key={i} style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <input value={s.name} onChange={(e) => setSup(i, "name", e.target.value)} placeholder="Nom" style={{ ...FF, flex: 1, padding: 8, borderRadius: 8, border: `1px solid ${C.border}` }} />
              <input type="number" value={s.price} onChange={(e) => setSup(i, "price", Number(e.target.value))} placeholder="€" style={{ ...FF, width: 70, padding: 8, borderRadius: 8, border: `1px solid ${C.border}` }} />
            </div>
          ))}
          <Btn variant="subtle" size="xs" style={{ marginTop: 6 }} onClick={() => setF((p) => ({ ...p, supplements: [...p.supplements, { name: "", price: 0 }] }))}>+ Supplément</Btn>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="primary" style={{ flex: 1 }} onClick={() => onSave(f)}>Enregistrer</Btn>
          {item.id && <Btn variant="red" onClick={() => onDelete(item)}>Supprimer</Btn>}
        </div>
      </div>
    </Modal>
  );
}

/* ---- CRM ---- */
function CRMTab({ restaurant, store }) {
  const toast = useToast();
  const [seg, setSeg] = useState("all");
  const [campaign, setCampaign] = useState({ subject: "", html: "" });
  const [sending, setSending] = useState(false);

  const segments = {
    all: () => true,
    top: (c) => c.order_count >= 5 || c.total_spent / Math.max(c.order_count, 1) >= 25,
    inactive: (c) => {
      const days = (Date.now() - new Date(c.last_visit).getTime()) / 86400000;
      return days >= 30;
    },
  };
  const filtered = store.customers.filter(segments[seg]);

  const send = async () => {
    if (!campaign.subject || !campaign.html) return toast("Sujet et message requis", "error");
    setSending(true);
    try {
      if (!hasSupabase || store.demoMode) {
        toast(`(Démo) Campagne envoyée à ${filtered.length} clients`, "success");
      } else {
        const data = await callFunction("send-campaign", {
          restaurant_id: restaurant.id, restaurant_name: restaurant.name,
          subject: campaign.subject, html_body: campaign.html,
          recipients: filtered.map((c) => c.email),
        });
        toast(`Envoyé : ${data.sent}, échecs : ${data.failed}`, "success");
      }
      setCampaign({ subject: "", html: "" });
    } catch (e) {
      toast(e.message || "Erreur d'envoi", "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <h2 style={{ ...FF, fontSize: 22, fontWeight: 800, marginBottom: 14 }}>👥 CRM & Campagnes</h2>
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {[["all", "Tous"], ["top", "Top clients"], ["inactive", "Inactifs 30j+"]].map(([id, lbl]) => (
          <button key={id} onClick={() => setSeg(id)} style={{ ...FF, padding: "7px 13px", borderRadius: 10, fontWeight: 600, fontSize: 13, border: `1px solid ${seg === id ? C.text : C.border}`, background: seg === id ? C.text : C.surface, color: seg === id ? C.white : C.text }}>{lbl} ({store.customers.filter(segments[id]).length})</button>
        ))}
      </div>

      <Surface style={{ padding: 18, marginBottom: 16 }}>
        <strong style={{ ...FF }}>✉️ Nouvelle campagne — segment « {seg} » ({filtered.length} destinataires)</strong>
        <InputField label="Sujet" value={campaign.subject} onChange={(e) => setCampaign({ ...campaign, subject: e.target.value })} style={{ marginTop: 10 }} />
        <textarea value={campaign.html} onChange={(e) => setCampaign({ ...campaign, html: e.target.value })} placeholder="<h1>Offre spéciale...</h1>" style={{ ...FF, width: "100%", minHeight: 100, padding: 12, borderRadius: 12, border: `1px solid ${C.borderStrong}`, outline: "none" }} />
        <Btn variant="primary" style={{ marginTop: 10 }} onClick={send} disabled={sending}>{sending ? "Envoi…" : `Envoyer à ${filtered.length} clients`}</Btn>
      </Surface>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.map((c) => (
          <Surface key={c.id} style={{ padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Avatar name={c.first_name || c.email} />
              <div>
                <strong style={{ ...FF }}>{c.first_name || c.email}</strong>
                <div style={{ ...FF, fontSize: 12, color: C.textSecondary }}>{c.email}{c.phone ? ` · ${c.phone}` : ""}</div>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ ...FF, fontSize: 13 }}>{c.order_count} cmd · {eur(c.total_spent)}</div>
              <div style={{ ...FF, fontSize: 11, color: C.textTertiary }}>Dernière visite {c.last_visit}</div>
            </div>
          </Surface>
        ))}
      </div>
    </div>
  );
}

/* ============================================================================
 * INFLUENCER MATCHING — data-based analysis engine (Growth module)
 * Every figure is computed from observable metrics the restaurateur enters.
 * Nothing is scraped or invented; missing data must be asked for, not guessed.
 * ==========================================================================*/
const INF_TIERS = [
  { max: 10000, label: "Nano / Micro", min: 100, mid: 125, hi: 150 },
  { max: 50000, label: "Micro", min: 150, mid: 200, hi: 250 },
  { max: 100000, label: "Micro+", min: 200, mid: 250, hi: 300 },
  { max: 200000, label: "Mid-Tier", min: 250, mid: 325, hi: 400 },
  { max: 500000, label: "Mid-Tier+", min: 350, mid: 475, hi: 600 },
  { max: 1000000, label: "Macro", min: 500, mid: 750, hi: 1000 },
  { max: Infinity, label: "Mega", min: 800, mid: 1400, hi: 2000 },
];
const infTier = (f) => INF_TIERS.find((t) => f < t.max) || INF_TIERS[INF_TIERS.length - 1];
const MONTH_NAMES = ["", "Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const TRACK_OPTS = [
  { id: "none", label: "Aucune preuve", mult: 0.75 },
  { id: "some", label: "1-2 prouvées", mult: 0.95 },
  { id: "proven", label: "3+ réussies", mult: 1.2 },
  { id: "metrics", label: "Peut montrer les métriques", mult: 1.4 },
];
const TIMING_MULT = { 1: 1.1, 2: 1.0, 3: 1.0, 4: 0.95, 5: 0.95, 6: 0.95, 7: 0.65, 8: 0.65, 9: 0.95, 10: 0.95, 11: 1.4, 12: 1.4 };
const VERDICTS = {
  TRY: { label: "À TENTER", emoji: "✅", color: C.accentGreen, note: "Feux verts réunis, prix justifié, ROI positif même au pire — go." },
  NEGOTIATE: { label: "À NÉGOCIER", emoji: "⚠️", color: C.accentOrange, note: "Quelques réserves gérables — négociez le prix à la baisse avant de lancer." },
  RISKY: { label: "RISKY", emoji: "🔴", color: C.accent, note: "Plusieurs signaux de prudence ou ROI marginal — n'y allez que si vous acceptez le risque." },
  SKIP: { label: "SKIP", emoji: "❌", color: C.textSecondary, note: "Red flag critique — investissement non rentable, cherchez un meilleur profil." },
};

function engagementMult(rate) {
  if (rate < 2) return 0.5;
  if (rate < 3) return 0.7;
  if (rate < 5) return 1.0;
  if (rate < 8) return 1.3;
  if (rate <= 12) return 1.7;
  return 2.0;
}
function frequencyMult(perWeek) {
  if (perWeek < 0.25) return 0.5;
  if (perWeek < 0.5) return 0.7;
  if (perWeek < 1.5) return 0.9;
  if (perWeek < 3.5) return 1.0;
  if (perWeek <= 6) return 1.3;
  return 1.5;
}
function saturationMult(p) {
  if (p === 0) return 1.2;
  if (p <= 2) return 1.0;
  if (p <= 4) return 0.85;
  if (p <= 6) return 0.65;
  return 0.4;
}

function analyzeInfluencer(d, content) {
  const followers = Math.max(0, Number(d.followers) || 0);
  const avgLikes = Math.max(0, Number(d.avgLikes) || 0);
  const avgComments = Math.max(0, Number(d.avgComments) || 0);
  const posts30 = Math.max(0, Number(d.posts30) || 0);
  const partnerships = Math.max(0, Number(d.partnerships) || 0);
  const avgTicket = Math.max(0, Number(d.avgTicket) || 0);
  const month = Number(d.month) || new Date().getMonth() + 1;
  // Audience locality can't be measured from a public profile — it's an explicit
  // assumption (default 50%), never presented as fetched data.
  const localAssumed = d.localPct ? Math.min(100, Math.max(0, Number(d.localPct))) : 50;

  const engagement = followers > 0 ? ((avgLikes + avgComments) / followers) * 100 : 0;
  const perWeek = posts30 / 4.3;
  const tier = infTier(followers);
  const trackOpt = TRACK_OPTS.find((t) => t.id === d.track) || TRACK_OPTS[0];

  // Price is driven only by real/observable market metrics — not by the AI read.
  const mults = {
    engagement: engagementMult(engagement),
    frequency: frequencyMult(perWeek),
    saturation: saturationMult(partnerships),
    timing: TIMING_MULT[month] || 1.0,
    track: trackOpt.mult,
  };
  const product = Object.values(mults).reduce((a, b) => a * b, 1);
  const raw = tier.mid * product;
  const round50 = (n) => Math.round(n / 50) * 50;
  const low = Math.max(100, round50(raw * 0.7));
  const high = Math.max(low + 50, round50(raw * 0.9));
  const target = Math.max(120, round50(raw * 0.8));

  const fit = content && Number.isFinite(Number(content.fitScore)) ? Number(content.fitScore) : null;
  const quality = content?.quality || null;

  const flags = { skip: [], caution: [], green: [] };
  if (followers > 0 && engagement < 2) flags.skip.push(`Engagement ${engagement.toFixed(2)}% < 2% — audience morte ou fake`);
  if (partnerships >= 7) flags.skip.push(`${partnerships} partenariats restos récents — audience saturée`);
  if (d.botComments) flags.skip.push("Commentaires majoritairement bots / emoji génériques");
  if (d.unnaturalGrowth) flags.skip.push("Croissance anormale — followers probablement achetés");
  if (d.refusesData) flags.skip.push("Refuse de partager ses analytics — cache ses chiffres");
  if (fit !== null && fit <= 2) flags.skip.push("Contenu sans rapport avec votre restaurant (lecture IA)");

  if (engagement >= 2 && engagement < 4) flags.caution.push(`Engagement faible (${engagement.toFixed(2)}%)`);
  if (posts30 > 0 && perWeek < 1) flags.caution.push(`Publie peu (${perWeek.toFixed(1)} post/semaine)`);
  if (partnerships >= 4 && partnerships <= 6) flags.caution.push(`${partnerships} partenariats restos — saturation qui commence`);
  if (d.newAccount) flags.caution.push("Compte récent (< 3 mois) — pas d'historique");
  if (d.track === "none") flags.caution.push("Aucun track record vérifiable");
  if (quality === "low") flags.caution.push("Contenu jugé bas de gamme (lecture IA)");
  if (fit !== null && fit > 2 && fit < 5) flags.caution.push("Adéquation contenu/restaurant moyenne (lecture IA)");

  if (engagement >= 5) flags.green.push(`Engagement réel (${engagement.toFixed(2)}%)`);
  if (perWeek >= 2) flags.green.push(`Publie régulièrement (${perWeek.toFixed(1)}/semaine)`);
  if (partnerships <= 2) flags.green.push("Peu/pas de concurrence resto récente");
  if (d.track === "proven" || d.track === "metrics") flags.green.push("Track record démontrable");
  if (fit !== null && fit >= 8) flags.green.push("Contenu très aligné avec votre restaurant (lecture IA)");
  if (quality === "high") flags.green.push("Contenu de qualité (lecture IA)");

  // ROI from actual per-post engaged users (real), discounted by the assumed local share.
  const perPostEngaged = avgLikes + avgComments;
  const localShare = localAssumed / 100;
  const visitsReal = Math.round(perPostEngaged * 0.05 * localShare);
  const budget = Number(d.budget) || target;
  const scen = (factor) => {
    const visits = Math.max(0, Math.round(visitsReal * factor));
    const revenue = Math.round(visits * 0.65 * avgTicket);
    const roi = budget > 0 ? Math.round(((revenue - budget) / budget) * 100) : 0;
    return { visits, revenue, roi };
  };
  const roi = { pess: scen(0.7), real: scen(1.0), opti: scen(1.3) };

  // --- Decision intelligence ------------------------------------------------
  // Break-even: highest price that still breaks even in the pessimistic case.
  const breakEven = Math.max(0, Math.floor(roi.pess.revenue));
  // Value added beyond direct covers: reusable UGC + repeat-client lifetime value.
  const ugcValue = 500;                                  // ~1 pro-grade content set
  const repeatValue = Math.round(roi.real.revenue * 0.25); // returning-customer LTV proxy
  const valueAdded = ugcValue + repeatValue;
  const totalReal = roi.real.revenue + valueAdded;
  const totalRoi = budget > 0 ? Math.round(((totalReal - budget) / budget) * 100) : 0;
  // Channel benchmark: what the same budget buys on paid ads (Paris ~0.80€ CPC,
  // ~8% landing→visit) — a sanity check, not a promise.
  const adVisits = budget > 0 ? Math.round((budget / 0.8) * 0.08) : 0;
  const betterChannel = roi.real.visits >= adVisits ? "influencer" : "ads";
  // Analysis confidence: how much rests on real data vs assumptions.
  const realInputs = [d.followersReal, d.likesReal, d.commentsReal, d.posts30Real, d.partnershipsReal].filter(Boolean).length;
  const confidencePct = Math.round((realInputs / 5) * 100);

  const engScore = engagement >= 12 ? 10 : engagement >= 6 ? 7 : engagement >= 3 ? 4 : 1;

  let verdict;
  if (flags.skip.length) verdict = "SKIP";
  else if (roi.pess.roi < 0 || flags.caution.length >= 3) verdict = "RISKY";
  else if (flags.caution.length >= 1) verdict = "NEGOTIATE";
  else verdict = "TRY";

  return { followers, engagement, perWeek, partnerships, tier, mults, raw, low, high, target, flags, roi, visitsReal, budget, engScore, fit, quality, localAssumed, localKnown: !!d.localPct, verdict, month, avgTicket, trackLabel: trackOpt.label, breakEven, ugcValue, repeatValue, valueAdded, totalReal, totalRoi, adVisits, betterChannel, confidencePct };
}

function detectPlatform(input) {
  const s = (input || "").toLowerCase();
  if (s.includes("tiktok")) return "tiktok";
  if (s.includes("youtu")) return "youtube";
  if (s.includes("linkedin")) return "linkedin";
  return "instagram";
}

// Deterministic placeholder used only in demo mode (no edge function available).
function localDemoEstimate(handle) {
  const seed = (handle || "demo").replace(/\W/g, "").length || 5;
  const followers = 15000 + ((seed * 9173) % 165000);
  const engPct = 3 + (seed % 6);
  const avgLikes = Math.round((followers * engPct) / 100 * 0.9);
  return {
    followers, avgLikes, avgComments: Math.round(avgLikes * 0.12),
    posts30: 5 + (seed % 12), partnerships: seed % 3, localPct: 50 + (seed % 40),
    confidence: "low", note: "Échantillon de démonstration — connecte l'IA (fonction chat-agent) pour de vraies estimations.",
  };
}

function InfluencerTab({ restaurant, store }) {
  const toast = useToast();
  const [url, setUrl] = useState("");
  const [f, setF] = useState({
    username: "", platform: "instagram", followers: "", avgLikes: "", avgComments: "",
    posts30: "", partnerships: "0", localPct: "", avgTicket: "", avgTicketTouched: false, budget: "",
    track: "none", month: String(new Date().getMonth() + 1),
    botComments: false, unnaturalGrowth: false, refusesData: false, newAccount: false,
  });
  const [report, setReport] = useState(null);
  const [content, setContent] = useState(null);  // AI content read
  const [meta, setMeta] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  // Average ticket comes from the restaurant's REAL order history — the SaaS
  // already knows it; we never ask the user to type it.
  const allOrders = [...(store.orders || []), ...(store.doneOrders || [])];
  const ticketSamples = allOrders.map((o) => Number(o.total) || 0).filter((n) => n > 0);
  let realTicket = 0, ticketSource = "none";
  if (ticketSamples.length) {
    realTicket = Math.round(ticketSamples.reduce((a, b) => a + b, 0) / ticketSamples.length);
    ticketSource = "orders";
  } else {
    const cust = store.customers || [];
    const spent = cust.reduce((a, c) => a + (Number(c.total_spent) || 0), 0);
    const cnt = cust.reduce((a, c) => a + (Number(c.order_count) || 0), 0);
    if (cnt) { realTicket = Math.round(spent / cnt); ticketSource = "customers"; }
  }
  const effectiveTicket = realTicket || 25;

  useEffect(() => {
    setF((p) => (p.avgTicketTouched ? p : { ...p, avgTicket: String(effectiveTicket) }));
  }, [effectiveTicket]);

  // History of past analyses + tracked partnerships (marketing_trackers)
  const [history, setHistory] = useState([]);
  const [trackers, setTrackers] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const loadHistory = useCallback(async () => {
    if (!hasSupabase || store.demoMode) return;
    const { data } = await supabase.from("influencer_analyses").select("*").eq("restaurant_id", restaurant.id).order("created_at", { ascending: false }).limit(12);
    setHistory(data || []);
  }, [restaurant.id, store.demoMode]);
  const loadTrackers = useCallback(async () => {
    if (!hasSupabase || store.demoMode) return;
    const { data } = await supabase.from("marketing_trackers").select("*").eq("restaurant_id", restaurant.id).eq("source", "influencer").order("created_at", { ascending: false });
    setTrackers(data || []);
  }, [restaurant.id, store.demoMode]);
  useEffect(() => { loadHistory(); loadTrackers(); }, [loadHistory, loadTrackers]);

  // Launch a tracked partnership: real link + promo code, auto-tracked.
  const launch = async (r, who) => {
    const username = who || f.username;
    const base = (restaurant.name || "RESTO").replace(/\W/g, "").slice(0, 6).toUpperCase() || "RESTO";
    const code = `${base}${Math.floor(Math.random() * 90 + 10)}`;
    const slug = `${(restaurant.slug || "r").slice(0, 4)}${Math.random().toString(36).slice(2, 8)}`;
    if (!hasSupabase || store.demoMode) { toast(`(Démo) Tracker créé · code ${code}`, "success"); return; }
    const { error } = await supabase.from("marketing_trackers").insert({
      restaurant_id: restaurant.id, label: `Partenariat ${username || "influenceur"}`,
      source: "influencer", channel: f.platform || "tiktok", influencer_username: username,
      promo_code: code, slug, budget: r ? r.budget : 0,
    });
    if (error) return toast(error.message, "error");
    copy(`${siteBase()}/go/${slug}`);
    toast(`Suivi créé · code ${code} · lien copié`, "success");
    loadTrackers();
  };
  const reopen = (h) => {
    const inputs = h.inputs || {};
    const next = { ...f, ...inputs };
    setF(next);
    setContent(inputs.ai || null);
    setMeta({ real: true, platform: h.platform || "tiktok", fields: inputs.likesReal ? ["avgLikes"] : [], reopened: true });
    analyze(next, inputs.ai || null);
    setShowHistory(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const analyze = (data, ai = content) => {
    const withTicket = { ...data, avgTicket: data.avgTicketTouched ? data.avgTicket : String(effectiveTicket) };
    const r = analyzeInfluencer(withTicket, ai);
    setReport(r);
    if (hasSupabase && !store.demoMode) {
      supabase.from("influencer_analyses").insert({
        restaurant_id: restaurant.id, username: withTicket.username, platform: withTicket.platform,
        followers: r.followers, engagement_rate: Number(r.engagement.toFixed(2)),
        verdict: r.verdict, price_target: r.target, roi_realistic: r.roi.real.roi,
        inputs: { ...withTicket, ai: ai || null },
      }).then(({ error }) => { if (error) console.warn("analysis not saved:", error.message); });
    }
  };

  const run = async () => {
    const handle = url.trim();
    if (!handle) return toast("Colle l'URL ou le @username de l'influenceur", "error");
    const platform = detectPlatform(handle);
    setBusy(true); setReport(null); setMeta(null); setContent(null);
    try {
      if (hasSupabase && !store.demoMode) {
        const d = await callFunction("chat-agent", { mode: "influencer-fetch", text: handle, context: platform });
        if (!d || !d.real || !d.followers) throw new Error(d?.error || "blocked");
        const followers = Number(d.followers) || 0;
        const avgLikes = d.avgLikes != null ? Number(d.avgLikes) : Math.round(followers * 0.04);
        const avgComments = d.avgComments != null ? Number(d.avgComments) : Math.round(avgLikes * 0.08);
        const fields = d.fields_real || [];
        const merged = {
          ...f, username: d.nickname || handle, platform: d.platform || platform,
          followers: String(followers), avgLikes: String(avgLikes), avgComments: String(avgComments),
          posts30: d.posts30 != null ? String(d.posts30) : (f.posts30 || ""),
          partnerships: d.partnerships != null ? String(d.partnerships) : (f.partnerships || "0"),
          localPct: f.localPct || "",
          followersReal: true, likesReal: fields.includes("avgLikes"), commentsReal: fields.includes("avgComments"),
          posts30Real: d.posts30 != null, partnershipsReal: d.partnerships != null,
        };
        setF(merged);
        setMeta({ real: true, recent: !!d.recent, platform: d.platform || platform, fields, region: d.region || "", verified: !!d.verified, bio: d.bio || "" });

        // AI content read (qualitative) — grounded on the real bio + recent captions.
        let ai = null;
        const eng = followers > 0 ? (((avgLikes + avgComments) / followers) * 100).toFixed(1) : "0";
        const caps = Array.isArray(d.captions) ? d.captions.slice(0, 6) : [];
        try {
          ai = await callFunction("chat-agent", {
            mode: "influencer-content",
            text: `Restaurant: ${restaurant.name}${restaurant.address ? ` (${restaurant.address})` : ""}. ` +
              `Créateur: "${d.nickname || handle}" sur ${d.platform || platform}. ` +
              `Bio: ${d.bio ? `"${d.bio}"` : "(vide)"}. Followers: ${followers}. Engagement: ${eng}%. ` +
              `${d.region ? `Région du créateur: ${d.region}. ` : ""}${d.verified ? "Compte vérifié. " : ""}` +
              `${caps.length ? `Dernières légendes: ${caps.map((c) => `"${c}"`).join(" ; ")}.` : "Légendes récentes indisponibles."}`,
          });
          if (ai && (ai.fitScore || ai.summary)) setContent(ai); else ai = null;
        } catch { ai = null; }

        analyze(merged, ai);
      } else {
        const est = localDemoEstimate(handle);
        const merged = {
          ...f, username: handle, platform,
          followers: String(est.followers), avgLikes: String(est.avgLikes),
          avgComments: String(est.avgComments), posts30: String(est.posts30),
          partnerships: String(est.partnerships), localPct: String(est.localPct),
        };
        const ai = { niche: "Food / lifestyle", contentType: "Démo", quality: "medium", fitScore: 7, fitReason: "Exemple de démonstration.", summary: "Lecture IA simulée (mode démo).", confidence: "low" };
        setF(merged);
        setContent(ai);
        setMeta({ real: false, demo: true, note: est.note });
        analyze(merged, ai);
      }
    } catch {
      toast("Récupération bloquée par la plateforme — saisis les chiffres puis « Recalculer ».", "error");
      setF((p) => ({ ...p, username: handle, platform }));
      setShowDetails(true);
    } finally {
      setBusy(false);
    }
  };

  const copy = (txt) => {
    try { navigator.clipboard.writeText(txt); toast("Copié !", "success"); }
    catch { toast("Copie impossible", "error"); }
  };
  const contactTemplate = (r) =>
    `Salut ${f.username || "[nom]"},\n\n` +
    `On adore ton contenu — l'aesthetic et ton audience matchent bien notre vibe.\n\n` +
    `On est ${restaurant.name}${restaurant.address ? `, situé ${restaurant.address}` : ""}.\n` +
    `On cherche quelqu'un pour nous mettre en valeur, et on pense à toi.\n\n` +
    `Proposition :\n- Budget : ${r.target}€\n- Contenu : 1 post feed + 10-15 stories\n- Timeline : 1 semaine de création\n\n` +
    `Ça t'intéresse ?`;

  const numField = (k, label, ph) => (
    <div style={{ flex: "1 1 150px" }}>
      <InputField label={label} type="number" min={0} placeholder={ph} value={f[k]} onChange={(e) => set(k, e.target.value)} />
    </div>
  );
  const check = (k, label) => (
    <label style={{ ...FF, fontSize: 13, display: "flex", gap: 8, alignItems: "center", flex: "1 1 220px" }}>
      <input type="checkbox" checked={f[k]} onChange={(e) => set(k, e.target.checked)} /> {label}
    </label>
  );

  return (
    <div>
      <h2 style={{ ...FF, fontSize: 22, fontWeight: 800, marginBottom: 4 }}>📣 Matching influenceurs</h2>
      <p style={{ ...FF, fontSize: 13, color: C.textSecondary, marginBottom: 16 }}>
        Colle l'URL ou le <b>@username</b> — on récupère les vrais chiffres du profil, l'IA lit le contenu, et l'analyse calcule un prix équitable + un ROI honnête.
      </p>

      <Surface style={{ padding: 18, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 260px" }}>
            <InputField label="Lien du profil ou @username" placeholder="https://tiktok.com/@mams.edo  ·  @sarah_lifestyle" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") run(); }} />
          </div>
          <Btn variant="primary" size="lg" style={{ flex: "0 0 auto" }} onClick={run} disabled={busy}>
            {busy ? "Analyse…" : "Analyser ✨"}
          </Btn>
        </div>
        <p style={{ ...FF, fontSize: 12, color: C.textTertiary, marginTop: 8 }}>
          Panier moyen pour le ROI : <b>{effectiveTicket}€</b> {ticketSource === "none" ? "(pas encore de commandes — défaut)" : "— issu de vos commandes encaissées"}.
        </p>
      </Surface>

      {meta && (
        <Surface style={{ padding: 14, marginBottom: 14, background: meta.real ? "#EAF7EE" : "#FFF6E5", border: `1px solid ${(meta.real ? C.accentGreen : "#F2C94C")}44` }}>
          <div style={{ ...FF, fontSize: 13 }}>
            {meta.real ? (
              meta.recent ? (
                <>✅ <b>Tout en réel</b> via {meta.platform} : followers, engagement récent, fréquence de post (30 j) et partenariats food détectés{meta.region ? ` · créateur basé en ${meta.region}` : ""}{meta.verified ? " · vérifié" : ""}. Seul le % d'audience locale reste une hypothèse (non exposé par {meta.platform}).</>
              ) : (
                <>✅ <b>Chiffres réels</b> via {meta.platform} : followers + engagement{meta.region ? ` · créateur basé en ${meta.region}` : ""}{meta.verified ? " · vérifié" : ""}. Posts récents non accessibles → fréquence/partenariats en hypothèse (ajustables).</>
              )
            ) : (
              <>⚠️ <b>Mode démo</b> — chiffres d'exemple non réels.{meta.note ? ` ${meta.note}` : ""}</>
            )}
            {" "}
            <button onClick={() => setShowDetails((v) => !v)} style={{ ...FF, color: C.accentBlue, fontWeight: 700, fontSize: 13, textDecoration: "underline" }}>
              {showDetails ? "Masquer les détails" : "Voir / ajuster les chiffres"}
            </button>
          </div>
        </Surface>
      )}

      {showDetails && (
        <Surface style={{ padding: 18, marginBottom: 16 }}>
          <div style={{ ...FF, fontSize: 13, fontWeight: 700, color: C.accentGreen, marginBottom: 8 }}>● Données récupérées (corrige si erreur)</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {numField("followers", "Followers", "180000")}
            {numField("avgLikes", "Likes moyens / post", "2100")}
            {numField("avgComments", "Commentaires moyens", "450")}
          </div>
          <div style={{ ...FF, fontSize: 13, fontWeight: 700, color: C.accentOrange, margin: "16px 0 8px" }}>● Hypothèses à confirmer (non mesurables automatiquement)</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {numField("posts30", "Posts (30 derniers jours)", "8")}
            {numField("partnerships", "Partenariats restos (3 mois)", "0")}
            {numField("localPct", "% audience locale (si connu)", "50")}
            {numField("budget", "Budget envisagé (€, optionnel)", "auto")}
            <div style={{ flex: "1 1 150px" }}>
              <label style={{ ...FF, display: "block", fontSize: 13, fontWeight: 600, color: C.textSecondary, marginBottom: 6 }}>Mois de publication</label>
              <select value={f.month} onChange={(e) => set("month", e.target.value)} style={{ ...FF, width: "100%", padding: "12px 14px", borderRadius: 12, border: `1px solid ${C.borderStrong}` }}>
                {MONTH_NAMES.slice(1).map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div style={{ flex: "1 1 150px" }}>
              <label style={{ ...FF, display: "block", fontSize: 13, fontWeight: 600, color: C.textSecondary, marginBottom: 6 }}>Track record</label>
              <select value={f.track} onChange={(e) => set("track", e.target.value)} style={{ ...FF, width: "100%", padding: "12px 14px", borderRadius: 12, border: `1px solid ${C.borderStrong}` }}>
                {TRACK_OPTS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div style={{ flex: "1 1 150px" }}>
              <InputField label="Panier moyen (auto, €)" type="number" min={0} value={f.avgTicket} onChange={(e) => setF((p) => ({ ...p, avgTicket: e.target.value, avgTicketTouched: true }))} />
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={{ ...FF, fontSize: 13, fontWeight: 600, color: C.textSecondary, marginBottom: 8 }}>Signaux d'alerte observés :</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {check("botComments", "Commentaires bots / emoji génériques")}
              {check("unnaturalGrowth", "Croissance anormale (followers achetés)")}
              {check("refusesData", "Refuse de partager ses analytics")}
              {check("newAccount", "Compte récent (< 3 mois)")}
            </div>
          </div>
          <Btn variant="primary" style={{ marginTop: 16 }} onClick={() => analyze(f)}>Recalculer</Btn>
        </Surface>
      )}

      {report && <InfluencerReport r={report} f={f} content={content} copy={copy} contactTemplate={contactTemplate} restaurant={restaurant} onLaunch={launch} />}

      {/* Tracked partnerships (auto: clicks + code redemptions + revenue) */}
      {trackers.length > 0 && (
        <Surface style={{ padding: 18, marginTop: 16 }}>
          <strong style={{ ...FF }}>📌 Partenariats suivis</strong>
          <p style={{ ...FF, fontSize: 12, color: C.textSecondary, marginTop: 4 }}>Clics du lien, utilisations du code et CA réel attribués automatiquement. Gérez-les aussi dans l'onglet <b>Tracking</b>.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
            {trackers.map((tr) => <TrackerRow key={tr.id} t={tr} onCopy={copy} />)}
          </div>
        </Surface>
      )}

      {/* History */}
      {history.length > 0 && (
        <Surface style={{ padding: 18, marginTop: 16 }}>
          <button onClick={() => setShowHistory((v) => !v)} style={{ ...FF, fontWeight: 800, fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
            🕑 Historique des analyses ({history.length}) <span style={{ color: C.textTertiary, fontSize: 13 }}>{showHistory ? "▲" : "▼"}</span>
          </button>
          {showHistory && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
              {history.map((h) => {
                const vv = VERDICTS[h.verdict] || VERDICTS.NEGOTIATE;
                return (
                  <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, background: C.surfaceAlt, ...FF, fontSize: 13 }}>
                    <span style={{ fontSize: 16 }}>{vv.emoji}</span>
                    <div style={{ flex: 1 }}>
                      <strong>{h.username || "—"}</strong> <span style={{ color: C.textTertiary }}>· {h.platform}</span>
                      <div style={{ color: C.textSecondary, fontSize: 12 }}>{Number(h.followers || 0).toLocaleString("fr-FR")} fol · {h.engagement_rate}% eng · cible {h.price_target}€ · ROI {h.roi_realistic >= 0 ? "+" : ""}{h.roi_realistic}%</div>
                    </div>
                    <Tag color={vv.color}>{vv.label}</Tag>
                    {h.inputs && <Btn variant="subtle" size="sm" onClick={() => reopen(h)}>Rouvrir</Btn>}
                  </div>
                );
              })}
            </div>
          )}
        </Surface>
      )}
    </div>
  );
}


function InfluencerReport({ r, f, content, copy, contactTemplate, restaurant, onLaunch }) {
  const v = VERDICTS[r.verdict];
  const QUALITY = { high: { label: "Qualité élevée", color: C.accentGreen }, medium: { label: "Qualité moyenne", color: C.accentOrange }, low: { label: "Qualité faible", color: C.accent } };
  const mrows = [
    ["Engagement", `${r.engagement.toFixed(2)}%`, r.mults.engagement],
    ["Fréquence", `${r.perWeek.toFixed(1)}/sem`, r.mults.frequency],
    ["Saturation", `${r.partnerships} resto(s)`, r.mults.saturation],
    ["Timing", MONTH_NAMES[r.month], r.mults.timing],
    ["Track record", r.trackLabel, r.mults.track],
  ];
  const roiRows = [
    ["Pessimiste (-30%)", r.roi.pess, C.accentOrange],
    ["Réaliste", r.roi.real, C.accentBlue],
    ["Optimiste (+30%)", r.roi.opti, C.accentGreen],
  ];
  const mc = (m) => (m >= 1.2 ? C.accentGreen : m >= 1 ? C.text : m >= 0.7 ? C.accentOrange : C.accent);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Verdict */}
      <Surface style={{ padding: 22, borderLeft: `4px solid ${v.color}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 34 }}>{v.emoji}</span>
          <div>
            <div style={{ ...FF, fontSize: 12, fontWeight: 700, color: C.textTertiary, textTransform: "uppercase" }}>Verdict</div>
            <div style={{ ...FF, fontSize: 24, fontWeight: 900, color: v.color }}>{v.label}</div>
          </div>
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <Tag color={C.textTertiary}>{r.tier.label}</Tag>
            <div style={{ ...FF, fontSize: 12, color: C.textSecondary, marginTop: 4 }}>{r.followers.toLocaleString("fr-FR")} followers · {f.platform}</div>
            <div style={{ ...FF, fontSize: 11, color: r.confidencePct >= 50 ? C.accentGreen : C.accentOrange, marginTop: 2 }}>Fiabilité données : {r.confidencePct}%</div>
          </div>
        </div>
        <p style={{ ...FF, fontSize: 14, color: C.textSecondary, marginTop: 10 }}>{v.note}</p>
      </Surface>

      {/* Pricing */}
      <Surface style={{ padding: 18 }}>
        <strong style={{ ...FF }}>💰 Analyse de prix</strong>
        <div style={{ ...FF, fontSize: 13, color: C.textSecondary, margin: "6px 0 12px" }}>Base {r.tier.label} : {r.tier.mid}€ × multiplicateurs observables</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {mrows.map(([lbl, obs, m]) => (
            <div key={lbl} style={{ display: "flex", alignItems: "center", gap: 10, ...FF, fontSize: 14 }}>
              <span style={{ flex: 1 }}>{lbl}</span>
              <span style={{ color: C.textSecondary, fontSize: 13 }}>{obs}</span>
              <span style={{ width: 56, textAlign: "right", fontWeight: 800, color: mc(m) }}>×{m}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 140px", background: C.surfaceAlt, borderRadius: 12, padding: 14 }}>
            <div style={{ ...FF, fontSize: 12, color: C.textTertiary }}>Fourchette réaliste</div>
            <div style={{ ...FF, fontSize: 20, fontWeight: 900 }}>{r.low}€ – {r.high}€</div>
          </div>
          <div style={{ flex: "1 1 140px", background: v.color + "12", borderRadius: 12, padding: 14 }}>
            <div style={{ ...FF, fontSize: 12, color: C.textTertiary }}>Cible de négociation</div>
            <div style={{ ...FF, fontSize: 20, fontWeight: 900, color: v.color }}>{r.target}€</div>
          </div>
        </div>
      </Surface>

      {/* AI content read */}
      {content && (
        <Surface style={{ padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <strong style={{ ...FF }}>🎨 Lecture IA du contenu</strong>
            {content.quality && QUALITY[content.quality] && <Tag color={QUALITY[content.quality].color}>{QUALITY[content.quality].label}</Tag>}
            {content.confidence && <Tag color={C.textTertiary}>confiance {content.confidence}</Tag>}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
            {content.niche && <div style={{ flex: "1 1 140px", background: C.surfaceAlt, borderRadius: 12, padding: 12 }}><div style={{ ...FF, fontSize: 12, color: C.textTertiary }}>Niche</div><div style={{ ...FF, fontSize: 15, fontWeight: 700 }}>{content.niche}</div></div>}
            {content.contentType && <div style={{ flex: "1 1 140px", background: C.surfaceAlt, borderRadius: 12, padding: 12 }}><div style={{ ...FF, fontSize: 12, color: C.textTertiary }}>Type de contenu</div><div style={{ ...FF, fontSize: 15, fontWeight: 700 }}>{content.contentType}</div></div>}
            {content.audienceGuess && <div style={{ flex: "1 1 140px", background: C.surfaceAlt, borderRadius: 12, padding: 12 }}><div style={{ ...FF, fontSize: 12, color: C.textTertiary }}>Audience probable</div><div style={{ ...FF, fontSize: 14, fontWeight: 600 }}>{content.audienceGuess}</div></div>}
          </div>
          {content.summary && <p style={{ ...FF, fontSize: 13.5, color: C.text, marginTop: 10 }}>{content.summary}</p>}
          {content.fitReason && <p style={{ ...FF, fontSize: 12.5, color: C.textSecondary, marginTop: 4 }}>Adéquation : {content.fitReason}</p>}
          <p style={{ ...FF, fontSize: 11.5, color: C.textTertiary, marginTop: 8 }}>Lecture IA à partir de la bio et des stats réelles — indicative, à confirmer en regardant le profil.</p>
        </Surface>
      )}

      {/* Red flags */}
      <Surface style={{ padding: 18 }}>
        <strong style={{ ...FF }}>🚦 Red flags</strong>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          {r.flags.skip.map((m) => <div key={m} style={{ ...FF, fontSize: 13, color: C.accent }}>❌ {m}</div>)}
          {r.flags.caution.map((m) => <div key={m} style={{ ...FF, fontSize: 13, color: C.accentOrange }}>⚠️ {m}</div>)}
          {r.flags.green.map((m) => <div key={m} style={{ ...FF, fontSize: 13, color: C.accentGreen }}>✅ {m}</div>)}
          {!r.flags.skip.length && !r.flags.caution.length && !r.flags.green.length && <div style={{ ...FF, fontSize: 13, color: C.textSecondary }}>Pas assez de données pour des signaux nets.</div>}
        </div>
      </Surface>

      {/* ROI */}
      <Surface style={{ padding: 18 }}>
        <strong style={{ ...FF }}>📈 Projection ROI</strong>
        <div style={{ ...FF, fontSize: 13, color: C.textSecondary, margin: "6px 0 12px" }}>
          Budget : {r.budget}€ · panier moyen {r.avgTicket}€ (vos données) · ~{r.visitsReal} visites (réaliste).
          {" "}Hypothèse audience locale : <b>{r.localAssumed}%</b>{r.localKnown ? "" : " (par défaut — ajuste si tu connais)"}.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {roiRows.map(([lbl, s, col]) => (
            <div key={lbl} style={{ display: "flex", alignItems: "center", gap: 10, ...FF, fontSize: 14, padding: "8px 12px", borderRadius: 10, background: C.surfaceAlt }}>
              <span style={{ flex: 1, fontWeight: 600 }}>{lbl}</span>
              <span style={{ color: C.textSecondary, fontSize: 13 }}>{s.visits} visites · {s.revenue}€</span>
              <span style={{ width: 80, textAlign: "right", fontWeight: 800, color: s.roi >= 0 ? col : C.accent }}>{s.roi >= 0 ? "+" : ""}{s.roi}%</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: "#FFF6E5", border: "1px solid #F2C94C55" }}>
          <strong style={{ ...FF, fontSize: 13 }}>⚠️ Disclaimer</strong>
          <p style={{ ...FF, fontSize: 12.5, color: C.textSecondary, marginTop: 4 }}>
            Projections basées sur l'engagement <b>observable</b> et des benchmarks. Elles intègrent des variables non contrôlées (trend, qualité du contenu, météo, bruit marketing).
            <b> Mesurez l'impact réel</b> via un code promo dédié, un QR code ou un lien de tracking — l'impact peut varier de 50 à 200 % de la projection.
          </p>
        </div>
      </Surface>

      {/* Negotiation & profitability */}
      <Surface style={{ padding: 18 }}>
        <strong style={{ ...FF }}>🤝 Négociation & rentabilité</strong>
        <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 160px", background: "#EAF7EE", borderRadius: 12, padding: 14 }}>
            <div style={{ ...FF, fontSize: 12, color: C.textTertiary }}>Prix plafond (rentable au pire)</div>
            <div style={{ ...FF, fontSize: 22, fontWeight: 900, color: C.accentGreen }}>{r.breakEven}€</div>
            <div style={{ ...FF, fontSize: 11.5, color: C.textSecondary, marginTop: 2 }}>Au-delà, le scénario pessimiste devient perdant.</div>
          </div>
          <div style={{ flex: "1 1 160px", background: C.surfaceAlt, borderRadius: 12, padding: 14 }}>
            <div style={{ ...FF, fontSize: 12, color: C.textTertiary }}>Valeur ajoutée estimée</div>
            <div style={{ ...FF, fontSize: 22, fontWeight: 900 }}>+{r.valueAdded}€</div>
            <div style={{ ...FF, fontSize: 11.5, color: C.textSecondary, marginTop: 2 }}>UGC réutilisable (~{r.ugcValue}€) + fidélisation (~{r.repeatValue}€).</div>
          </div>
          <div style={{ flex: "1 1 160px", background: v.color + "12", borderRadius: 12, padding: 14 }}>
            <div style={{ ...FF, fontSize: 12, color: C.textTertiary }}>ROI total potentiel</div>
            <div style={{ ...FF, fontSize: 22, fontWeight: 900, color: v.color }}>{r.totalRoi >= 0 ? "+" : ""}{r.totalRoi}%</div>
            <div style={{ ...FF, fontSize: 11.5, color: C.textSecondary, marginTop: 2 }}>Revenu direct + valeur ajoutée.</div>
          </div>
        </div>
        <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: C.surfaceAlt, ...FF, fontSize: 13 }}>
          <b>Influenceur vs publicité payante</b> — pour {r.budget}€ : ~<b>{r.roi.real.visits}</b> visites via l'influenceur contre ~<b>{r.adVisits}</b> via de la pub (estimation Paris). {" "}
          <span style={{ color: r.betterChannel === "influencer" ? C.accentGreen : C.accentOrange, fontWeight: 700 }}>
            {r.betterChannel === "influencer" ? "→ L'influenceur est plus rentable ici." : "→ La pub payante serait plus efficace ici."}
          </span>
        </div>
      </Surface>

      {/* Scoring */}
      <Surface style={{ padding: 18 }}>
        <strong style={{ ...FF }}>📊 Scoring</strong>
        <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 140px", background: C.surfaceAlt, borderRadius: 12, padding: 14 }}>
            <div style={{ ...FF, fontSize: 12, color: C.textTertiary }}>Engagement (réel)</div>
            <div style={{ ...FF, fontSize: 22, fontWeight: 900 }}>{r.engScore}<span style={{ fontSize: 13, color: C.textTertiary }}>/10</span></div>
          </div>
          <div style={{ flex: "1 1 140px", background: C.surfaceAlt, borderRadius: 12, padding: 14 }}>
            <div style={{ ...FF, fontSize: 12, color: C.textTertiary }}>Adéquation contenu (IA)</div>
            <div style={{ ...FF, fontSize: 22, fontWeight: 900 }}>{r.fit != null ? <>{r.fit}<span style={{ fontSize: 13, color: C.textTertiary }}>/10</span></> : <span style={{ fontSize: 14, color: C.textTertiary }}>n/a</span>}</div>
          </div>
        </div>
        <p style={{ ...FF, fontSize: 12, color: C.textTertiary, marginTop: 8 }}>Engagement = mesuré sur les vrais chiffres. Adéquation contenu = lecture IA de la bio/du profil (indicative).</p>
      </Surface>

      {/* Next steps */}
      {r.verdict !== "SKIP" && (
        <Surface style={{ padding: 18 }}>
          <strong style={{ ...FF }}>✅ Prochaines étapes</strong>
          <ol style={{ ...FF, fontSize: 13.5, color: C.text, paddingLeft: 18, marginTop: 8, lineHeight: 1.7 }}>
            <li>Contactez l'influenceur (template ci-dessous)</li>
            <li>Invitation privée → création (photos, stories) → publication</li>
            <li>Trackez avec un code promo dédié (ex. <b>{(restaurant.name || "RESTO").slice(0, 6).toUpperCase()}20</b>)</li>
            <li>≥ 70 visites → renouveler · 40-70 → réévaluer · &lt; 40 → changer de profil</li>
          </ol>
          <div style={{ marginTop: 12, position: "relative" }}>
            <pre style={{ ...FF, whiteSpace: "pre-wrap", fontSize: 13, background: C.surfaceAlt, borderRadius: 12, padding: 14, margin: 0 }}>{contactTemplate(r)}</pre>
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <Btn variant="subtle" size="sm" onClick={() => copy(contactTemplate(r))}>📋 Copier le message</Btn>
              <Btn variant="primary" size="sm" onClick={() => onLaunch?.(r)}>🚀 Lancer le suivi du partenariat</Btn>
            </div>
          </div>
        </Surface>
      )}
    </div>
  );
}

/* ---- Marketing tracking (links + promo codes) ---- */
function TrackerRow({ t: tr, onCopy, onDelete }) {
  const link = `${siteBase()}/go/${tr.slug}`;
  const conv = tr.clicks > 0 ? Math.round((tr.redemptions / tr.clicks) * 100) : 0;
  const roi = Number(tr.budget) > 0 ? Math.round(((Number(tr.revenue) - Number(tr.budget)) / Number(tr.budget)) * 100) : null;
  const srcEmoji = tr.source === "influencer" ? "📣" : tr.source === "staff" ? "🧑‍🍳" : "🔗";
  const stats = [["Clics", tr.clicks], ["Utilisations", tr.redemptions], ["Conversion", `${conv}%`], ["CA généré", eur(tr.revenue)], ["Budget", eur(tr.budget)], ["ROI", roi == null ? "—" : `${roi >= 0 ? "+" : ""}${roi}%`]];
  return (
    <div style={{ padding: 14, borderRadius: 12, background: C.surfaceAlt, ...FF, fontSize: 13 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 18 }}>{srcEmoji}</span>
        <strong style={{ fontSize: 14 }}>{tr.label || tr.influencer_username || "Opération"}</strong>
        {tr.channel && <Tag color={C.accentBlue}>{tr.channel}</Tag>}
        {tr.promo_code && <Tag color={C.accentGreen}>{tr.promo_code}</Tag>}
        {onDelete && <button onClick={() => onDelete(tr.id)} style={{ ...FF, marginLeft: "auto", color: C.accent, fontSize: 16 }}>✕</button>}
      </div>
      {tr.offer && <div style={{ ...FF, fontSize: 12.5, color: C.textSecondary, marginTop: 4 }}>{tr.offer}</div>}
      <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
        {stats.map(([k, val]) => (
          <div key={k} style={{ minWidth: 76 }}>
            <div style={{ fontSize: 11, color: C.textTertiary }}>{k}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: k === "ROI" && roi != null ? (roi >= 0 ? C.accentGreen : C.accent) : C.text }}>{val}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
        <Btn variant="subtle" size="sm" onClick={() => onCopy(link)}>🔗 Copier le lien</Btn>
        {tr.promo_code && <Btn variant="subtle" size="sm" onClick={() => onCopy(tr.promo_code)}>🏷️ Copier le code</Btn>}
      </div>
    </div>
  );
}

function TrackingTab({ restaurant, store }) {
  const toast = useToast();
  const [list, setList] = useState([]);
  const [influencers, setInfluencers] = useState([]);
  const [form, setForm] = useState({ label: "", source: "staff", channel: "instagram", influencer_username: "", offer: "", promo_code: "", budget: "" });
  const setF = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const load = useCallback(async () => {
    if (!hasSupabase || store.demoMode) return;
    const { data } = await supabase.from("marketing_trackers").select("*").eq("restaurant_id", restaurant.id).order("created_at", { ascending: false });
    setList(data || []);
    const { data: an } = await supabase.from("influencer_analyses").select("username,platform").eq("restaurant_id", restaurant.id).order("created_at", { ascending: false }).limit(50);
    const seen = new Set(); const infl = [];
    (an || []).forEach((a) => { if (a.username && !seen.has(a.username)) { seen.add(a.username); infl.push(a); } });
    setInfluencers(infl);
  }, [restaurant.id, store.demoMode]);
  useEffect(() => { load(); }, [load]);

  const copy = (txt) => { try { navigator.clipboard.writeText(txt); toast("Copié !", "success"); } catch { toast("Copie impossible", "error"); } };

  const create = async () => {
    if (!form.label.trim()) return toast("Donne un nom à l'opération", "error");
    if (!hasSupabase || store.demoMode) return toast("(Démo) création indisponible", "info");
    const slug = `${(restaurant.slug || "r").slice(0, 4)}${Math.random().toString(36).slice(2, 8)}`;
    const { error } = await supabase.from("marketing_trackers").insert({
      restaurant_id: restaurant.id, label: form.label.trim(), source: form.source, channel: form.channel,
      influencer_username: form.source === "influencer" ? (form.influencer_username || null) : null,
      offer: form.offer || null, promo_code: form.promo_code ? form.promo_code.toUpperCase().trim() : null,
      slug, budget: Number(form.budget) || 0,
    });
    if (error) return toast(error.message, "error");
    toast("Opération de tracking créée", "success");
    setForm({ label: "", source: form.source, channel: "instagram", influencer_username: "", offer: "", promo_code: "", budget: "" });
    load();
  };
  const remove = async (id) => {
    if (!hasSupabase || store.demoMode) return;
    await supabase.from("marketing_trackers").delete().eq("id", id);
    load();
  };

  const totalRevenue = list.reduce((s, x) => s + Number(x.revenue || 0), 0);
  const totalBudget = list.reduce((s, x) => s + Number(x.budget || 0), 0);
  const totalClicks = list.reduce((s, x) => s + Number(x.clicks || 0), 0);
  const totalRedemptions = list.reduce((s, x) => s + Number(x.redemptions || 0), 0);
  const globalRoi = totalBudget > 0 ? Math.round(((totalRevenue - totalBudget) / totalBudget) * 100) : null;
  const sel = (k, opts) => (
    <select value={form[k]} onChange={(e) => setF(k, e.target.value)} style={{ ...FF, width: "100%", padding: "12px 14px", borderRadius: 12, border: `1px solid ${C.borderStrong}` }}>
      {opts.map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
    </select>
  );

  return (
    <div>
      <h2 style={{ ...FF, fontSize: 22, fontWeight: 800, marginBottom: 4 }}>🔗 Tracking marketing</h2>
      <p style={{ ...FF, fontSize: 13, color: C.textSecondary, marginBottom: 16 }}>
        Créez un <b>lien traçable</b> et/ou un <b>code promo</b> pour chaque opération — partenariat influenceur ou post de votre équipe — et mesurez clics, utilisations et CA généré en temps réel.
      </p>

      {list.length > 0 && (
        <Surface style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
            {[["Clics", totalClicks], ["Utilisations code", totalRedemptions], ["CA total généré", eur(totalRevenue)], ["Budget total", eur(totalBudget)], ["ROI global", globalRoi == null ? "—" : `${globalRoi >= 0 ? "+" : ""}${globalRoi}%`]].map(([k, val]) => (
              <div key={k}>
                <div style={{ ...FF, fontSize: 11, color: C.textTertiary }}>{k}</div>
                <div style={{ ...FF, fontSize: 20, fontWeight: 900, color: k === "ROI global" && globalRoi != null ? (globalRoi >= 0 ? C.accentGreen : C.accent) : C.text }}>{val}</div>
              </div>
            ))}
          </div>
        </Surface>
      )}

      <Surface style={{ padding: 18, marginBottom: 16 }}>
        <strong style={{ ...FF }}>➕ Nouvelle opération</strong>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
          <div style={{ flex: "1 1 200px" }}><InputField label="Nom de l'opération" placeholder="Story Léa — menu de printemps" value={form.label} onChange={(e) => setF("label", e.target.value)} /></div>
          <div style={{ flex: "1 1 130px" }}>
            <label style={{ ...FF, display: "block", fontSize: 13, fontWeight: 600, color: C.textSecondary, marginBottom: 6 }}>Source</label>
            {sel("source", [["staff", "🧑‍🍳 Post équipe"], ["influencer", "📣 Influenceur"], ["other", "🔗 Autre"]])}
          </div>
          <div style={{ flex: "1 1 130px" }}>
            <label style={{ ...FF, display: "block", fontSize: 13, fontWeight: 600, color: C.textSecondary, marginBottom: 6 }}>Canal</label>
            {sel("channel", [["instagram", "Instagram"], ["tiktok", "TikTok"], ["youtube", "YouTube"], ["other", "Autre"]])}
          </div>
        </div>
        {form.source === "influencer" && (
          <div style={{ marginTop: 4 }}>
            <label style={{ ...FF, display: "block", fontSize: 13, fontWeight: 600, color: C.textSecondary, marginBottom: 6 }}>Influenceur sauvegardé</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <select value={form.influencer_username} onChange={(e) => setF("influencer_username", e.target.value)} style={{ ...FF, flex: "1 1 200px", padding: "12px 14px", borderRadius: 12, border: `1px solid ${C.borderStrong}` }}>
                <option value="">— Choisir / saisir —</option>
                {influencers.map((i) => <option key={i.username} value={i.username}>{i.username} ({i.platform})</option>)}
              </select>
              <div style={{ flex: "1 1 160px" }}><InputField placeholder="ou @username" value={form.influencer_username} onChange={(e) => setF("influencer_username", e.target.value)} /></div>
            </div>
          </div>
        )}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 4 }}>
          <div style={{ flex: "1 1 200px" }}><InputField label="Offre promue (optionnel)" placeholder="-15% sur le menu midi" value={form.offer} onChange={(e) => setF("offer", e.target.value)} /></div>
          <div style={{ flex: "1 1 140px" }}><InputField label="Code promo (optionnel)" placeholder="LEA15" value={form.promo_code} onChange={(e) => setF("promo_code", e.target.value)} /></div>
          <div style={{ flex: "1 1 120px" }}><InputField label="Budget (€)" type="number" min={0} placeholder="0" value={form.budget} onChange={(e) => setF("budget", e.target.value)} /></div>
        </div>
        <p style={{ ...FF, fontSize: 12, color: C.textTertiary, marginTop: 8 }}>
          💡 Le code promo doit aussi exister dans l'onglet <b>Promos</b> pour appliquer une vraie réduction au client. Ici, il sert à attribuer le CA. Un lien traçable est généré automatiquement.
        </p>
        <Btn variant="primary" size="lg" style={{ marginTop: 14 }} onClick={create}>Créer le lien de suivi</Btn>
      </Surface>

      {list.length === 0 ? (
        <Surface style={{ padding: 28, textAlign: "center" }}>
          <div style={{ fontSize: 36 }}>🔗</div>
          <p style={{ ...FF, color: C.textSecondary, marginTop: 8 }}>Aucune opération suivie. Créez la première — ou lancez-en une depuis l'onglet Influenceurs.</p>
        </Surface>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {list.map((tr) => <TrackerRow key={tr.id} t={tr} onCopy={copy} onDelete={remove} />)}
        </div>
      )}
    </div>
  );
}

/* ---- Check-in (hotel vertical) ---- */
const CHECKIN_STATUS = {
  arriving: { label: "Arrive", color: C.accentBlue },
  in_house: { label: "En séjour", color: C.accentGreen },
  departing: { label: "Départ", color: C.accentOrange },
  checked_out: { label: "Parti", color: C.textTertiary },
};
function CheckinTab({ restaurant, store }) {
  const toast = useToast();
  const [list, setList] = useState([]);
  const [filter, setFilter] = useState("all");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ guest_name: "", email: "", room: "", guests: 1, checkin_date: "", checkout_date: "" });
  const setF = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const load = useCallback(async () => {
    if (store.demoMode || !hasSupabase) {
      // Merge seeded demo stays with self check-ins done from the guest portal.
      setList([...DEMO_CHECKINS, ...readGuestCheckins()]);
      return;
    }
    const { data } = await supabase.from("checkins").select("*").eq("restaurant_id", restaurant.id).order("checkin_date", { ascending: true });
    setList(data || []);
  }, [restaurant.id, store.demoMode]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!form.guest_name.trim() || !form.room) return toast("Nom et chambre requis", "error");
    const row = { restaurant_id: restaurant.id, guest_name: form.guest_name.trim(), email: form.email || null, room: Number(form.room), guests: Number(form.guests) || 1, checkin_date: form.checkin_date || null, checkout_date: form.checkout_date || null, status: "arriving" };
    if (store.demoMode || !hasSupabase) {
      setList((p) => [...p, { ...row, id: uid() }]);
      toast("(Démo) Réservation ajoutée", "success");
    } else {
      const { error } = await supabase.from("checkins").insert(row);
      if (error) return toast(error.message, "error");
      toast("Réservation ajoutée", "success");
      load();
    }
    setAdding(false);
    setForm({ guest_name: "", email: "", room: "", guests: 1, checkin_date: "", checkout_date: "" });
  };
  const setStatus = async (c, status) => {
    if (store.demoMode || !hasSupabase) {
      setList((p) => p.map((x) => (x.id === c.id ? { ...x, status } : x)));
      writeGuestCheckins(readGuestCheckins().map((x) => (x.id === c.id ? { ...x, status } : x)));
      return;
    }
    const { error } = await supabase.from("checkins").update({ status }).eq("id", c.id);
    if (error) return toast(error.message, "error");
    load();
  };

  const counts = { arriving: 0, in_house: 0, departing: 0, checked_out: 0 };
  list.forEach((c) => { counts[c.status] = (counts[c.status] || 0) + 1; });
  const filtered = filter === "all" ? list : list.filter((c) => c.status === filter);

  return (
    <div>
      <h2 style={{ ...FF, fontSize: 22, fontWeight: 800, marginBottom: 4 }}>🛎️ Check-in</h2>
      <p style={{ ...FF, fontSize: 13, color: C.textSecondary, marginBottom: 16 }}>Gérez les arrivées, séjours et départs de vos clients — check-in et check-out en un clic.</p>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        {[["all", "Tous", C.text], ["arriving", "Arrivées", C.accentBlue], ["in_house", "En séjour", C.accentGreen], ["departing", "Départs", C.accentOrange]].map(([id, lbl, col]) => (
          <button key={id} onClick={() => setFilter(id)} style={{ ...FF, padding: "8px 14px", borderRadius: 999, fontWeight: 700, fontSize: 13, border: `1px solid ${filter === id ? col : C.border}`, background: filter === id ? col : C.surface, color: filter === id ? C.white : C.text }}>
            {lbl}{id !== "all" ? ` (${counts[id] || 0})` : ""}
          </button>
        ))}
        <Btn variant="primary" size="sm" style={{ marginLeft: "auto" }} onClick={() => setAdding((v) => !v)}>+ Réservation</Btn>
      </div>

      {adding && (
        <Surface style={{ padding: 18, marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 180px" }}><InputField label="Nom du client" value={form.guest_name} onChange={(e) => setF("guest_name", e.target.value)} /></div>
            <div style={{ flex: "1 1 100px" }}><InputField label="Chambre" type="number" min={1} value={form.room} onChange={(e) => setF("room", e.target.value)} /></div>
            <div style={{ flex: "1 1 90px" }}><InputField label="Pers." type="number" min={1} value={form.guests} onChange={(e) => setF("guests", e.target.value)} /></div>
            <div style={{ flex: "1 1 160px" }}><InputField label="Email (optionnel)" type="email" value={form.email} onChange={(e) => setF("email", e.target.value)} /></div>
            <div style={{ flex: "1 1 140px" }}><InputField label="Arrivée" type="date" value={form.checkin_date} onChange={(e) => setF("checkin_date", e.target.value)} /></div>
            <div style={{ flex: "1 1 140px" }}><InputField label="Départ" type="date" value={form.checkout_date} onChange={(e) => setF("checkout_date", e.target.value)} /></div>
          </div>
          <Btn variant="primary" onClick={add}>Ajouter</Btn>
        </Surface>
      )}

      {filtered.length === 0 ? (
        <Surface style={{ padding: 28, textAlign: "center" }}>
          <div style={{ fontSize: 36 }}>🛎️</div>
          <p style={{ ...FF, color: C.textSecondary, marginTop: 8 }}>Aucune réservation ici.</p>
        </Surface>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((c) => {
            const st = CHECKIN_STATUS[c.status] || CHECKIN_STATUS.arriving;
            return (
              <Surface key={c.id} style={{ padding: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: C.surfaceAlt, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", ...FF }}>
                  <span style={{ fontSize: 10, color: C.textTertiary }}>Ch.</span>
                  <strong style={{ fontSize: 16 }}>{c.room}</strong>
                </div>
                <div style={{ flex: "1 1 180px" }}>
                  <strong style={{ ...FF }}>{c.guest_name}</strong>
                  <div style={{ ...FF, fontSize: 12, color: C.textSecondary }}>{c.guests} pers.{c.checkin_date ? ` · ${c.checkin_date} → ${c.checkout_date || "?"}` : ""}{c.email ? ` · ${c.email}` : ""}</div>
                  {(c.id_type || c.access_code) && (
                    <div style={{ ...FF, fontSize: 11.5, color: C.textTertiary, marginTop: 2 }}>
                      {c.id_type ? `${c.id_type} n° ${c.id_number || "—"}${c.id_provided ? " ✅" : ""}` : ""}
                      {c.access_code ? ` · code ${c.access_code}` : ""}
                      {c.arrival_time ? ` · arrivée ${c.arrival_time}` : ""}
                    </div>
                  )}
                  {c.express_checkout && (
                    <div style={{ ...FF, fontSize: 11.5, color: C.accentOrange, marginTop: 2 }}>
                      🧳 Check-out express{c.bill_total ? ` · note ${eur(c.bill_total)}` : ""}{c.late_checkout ? " · late 15h" : ""}{c.luggage_hold ? " · bagagerie" : ""} — vérifier la chambre puis confirmer
                    </div>
                  )}
                </div>
                {c.access_code && <Tag color={C.accentBlue}>📲 en ligne</Tag>}
                <Tag color={st.color}>{st.label}</Tag>
                <div style={{ display: "flex", gap: 6 }}>
                  {c.status === "arriving" && <Btn variant="primary" size="sm" onClick={() => setStatus(c, "in_house")}>Check-in ✓</Btn>}
                  {(c.status === "in_house" || c.status === "departing") && <Btn variant="subtle" size="sm" onClick={() => setStatus(c, "checked_out")}>Check-out</Btn>}
                </div>
              </Surface>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---- Settings ---- */
// Commande factice couvrant deux taux de TVA, pour vérifier le rendu du
// bloc TVA sans passer par create_order_secure : aucune commande, aucun
// numéro fiscal, aucune écriture au journal ne doivent résulter d'un test.
function makeTestTicket() {
  return {
    id: "test", fiscal_number: "TEST", created_at: new Date().toISOString(),
    order_type: "dine_in", table: { number: 1 }, customer_name: "Client test",
    items: [
      { quantity: 2, name: "Plat test", price: 12.50, detail: "" },
      { quantity: 1, name: "Boisson test", price: 6.00, detail: "" },
    ],
    subtotal: 31.00, discount: 0, total: 31.00,
    vat_breakdown: [
      { rate: 10, base_ht: 22.73, vat: 2.27, total_ttc: 25.00 },
      { rate: 20, base_ht: 5.00, vat: 1.00, total_ttc: 6.00 },
    ],
    payment_method: "cash", payment_mode: "pay_at_counter", note: "", detailed: true,
  };
}

function SettingsTab({ restaurant, store, modules = ["base"], onModulesChange }) {
  const toast = useToast();
  const [settings, setSettings] = useState({ stripe_publishable_key: "", stripe_secret_key: "", openai_api_key: "", resend_api_key: "", resend_from: "", google_review_url: "", google_review_enabled: false, ticket_address: "", ticket_phone: "", ticket_tax_id: "", ticket_vat_number: "", ticket_footer: "", auto_print_enabled: true });
  const [testPrint, setTestPrint] = useState(null);

  const toggleModule = async (id) => {
    if (id === "base") return; // socle always active
    const has = modules.includes(id);
    const next = has ? modules.filter((m) => m !== id) : normalizeModules([...modules, id]);
    onModulesChange?.(next);
    if (store.demoMode || !hasSupabase) { toast("(Démo) Abonnement non persisté", "info"); return; }
    const { error } = await supabase.from("restaurant_settings").upsert({ restaurant_id: restaurant.id, active_modules: next }, { onConflict: "restaurant_id" });
    if (error) { onModulesChange?.(modules); return toast(error.message, "error"); }
    toast(has ? "Module désactivé" : "Module activé", "success");
  };

  useEffect(() => {
    if (store.demoMode || !hasSupabase) return;
    supabase.from("restaurant_settings").select("*").eq("restaurant_id", restaurant.id).maybeSingle().then(({ data }) => {
      if (data) setSettings((p) => ({ ...p, ...data }));
    });
  }, [restaurant.id, store.demoMode]);

  const save = async () => {
    if (store.demoMode || !hasSupabase) return toast("(Démo) Réglages non persistés", "info");
    const { error } = await supabase.from("restaurant_settings").upsert({ restaurant_id: restaurant.id, ...settings }, { onConflict: "restaurant_id" });
    // Sans cette vérification, une colonne manquante en base (migration non
    // exécutée) échouait en silence : le message affiché disait "enregistré"
    // alors que rien n'avait été écrit.
    if (error) return toast(error.message || "Échec de l'enregistrement", "error");
    toast("Réglages enregistrés", "success");
  };

  const field = (k, label, type = "text") => (
    <InputField label={label} type={type} value={settings[k] || ""} onChange={(e) => setSettings({ ...settings, [k]: e.target.value })} />
  );

  return (
    <div>
      <h2 style={{ ...FF, fontSize: 22, fontWeight: 800, marginBottom: 16 }}>⚙️ Paramètres</h2>

      <Surface style={{ padding: 18, marginBottom: 16 }}>
        <strong style={{ ...FF }}>💎 Abonnement & modules</strong>
        <p style={{ ...FF, fontSize: 13, color: C.textSecondary, marginTop: 6 }}>Activez ou désactivez les modules de ce restaurant. Le socle <b>Wegemo Menu</b> est toujours inclus.</p>
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          {MODULE_CATALOG.map((m) => {
            const active = modules.includes(m.id);
            const isBase = m.id === "base";
            return (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, borderRadius: 12, border: `1px solid ${active ? m.color + "55" : C.border}`, background: active ? m.color + "0c" : C.surface }}>
                <span style={{ fontSize: 26 }}>{m.emoji}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ ...FF, fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
                    {m.name}
                    {isBase && <Tag color={C.textTertiary}>Inclus</Tag>}
                    {active && !isBase && <Tag color={m.color}>Actif</Tag>}
                  </div>
                  <div style={{ ...FF, fontSize: 12, color: C.textSecondary, marginTop: 2 }}>{m.desc}</div>
                </div>
                <div style={{ ...FF, fontWeight: 800, fontSize: 14, color: m.color, whiteSpace: "nowrap" }}>{isBase ? "" : "+"}{m.price}€</div>
                {isBase ? (
                  <span style={{ ...FF, fontSize: 12, color: C.textTertiary, width: 92, textAlign: "right" }}>—</span>
                ) : (
                  <Btn variant={active ? "subtle" : "primary"} size="sm" style={active ? { width: 92 } : { width: 92, background: m.color }} onClick={() => toggleModule(m.id)}>
                    {active ? "Désactiver" : "Activer"}
                  </Btn>
                )}
              </div>
            );
          })}
        </div>
      </Surface>

      <Surface style={{ padding: 18, marginBottom: 16 }}>
        <strong style={{ ...FF }}>🔑 Clés API</strong>
        <div style={{ marginTop: 12 }}>
          {field("stripe_publishable_key", "Stripe — clé publique")}
          {field("stripe_secret_key", "Stripe — clé secrète", "password")}
          {field("openai_api_key", "OpenAI — clé API", "password")}
          {field("resend_api_key", "Resend — clé API", "password")}
          {field("resend_from", "Resend — expéditeur (Nom <email>)")}
        </div>
        <Btn variant="primary" onClick={save}>Enregistrer</Btn>
      </Surface>

      <Surface style={{ padding: 18, marginBottom: 16 }}>
        <strong style={{ ...FF }}>⭐ Avis Google</strong>
        <div style={{ marginTop: 10 }}>
          {field("google_review_url", "Lien d'avis Google")}
          <label style={{ ...FF, fontSize: 14, display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={settings.google_review_enabled} onChange={(e) => setSettings({ ...settings, google_review_enabled: e.target.checked })} /> Proposer l'avis Google après commande
          </label>
        </div>
      </Surface>

      <Surface style={{ padding: 18, marginBottom: 16 }}>
        <strong style={{ ...FF }}>🖨️ Ticket de caisse</strong>
        <p style={{ ...FF, fontSize: 13, color: C.textSecondary, marginTop: 6 }}>
          Dès qu'une commande arrive, l'écran Cuisine imprime automatiquement un ticket sur l'imprimante par défaut de l'appareil sur lequel il est ouvert. Laissez ce navigateur ouvert sur l'écran Cuisine du poste relié à l'imprimante.
        </p>
        <label style={{ ...FF, fontSize: 14, display: "flex", gap: 8, alignItems: "center", margin: "10px 0 4px" }}>
          <input type="checkbox" checked={settings.auto_print_enabled !== false} onChange={(e) => setSettings({ ...settings, auto_print_enabled: e.target.checked })} /> Impression automatique des tickets
        </label>
        <div style={{ marginTop: 8 }}>
          {field("ticket_address", "Adresse (affichée sur le ticket)")}
          {field("ticket_phone", "Téléphone")}
          {field("ticket_tax_id", "SIRET")}
          {field("ticket_vat_number", "N° TVA intracommunautaire")}
          {field("ticket_footer", "Message de fin de ticket (ex : Merci de votre visite !)")}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn variant="primary" onClick={save}>Enregistrer</Btn>
          <Btn variant="subtle" onClick={() => setTestPrint(makeTestTicket())}>🖨️ Imprimer un ticket test</Btn>
        </div>
        <p style={{ ...FF, fontSize: 12, color: C.textTertiary, marginTop: 8 }}>
          Imprime immédiatement sur l'imprimante par défaut de cet appareil, avec les réglages ci-dessus tels qu'affichés (même non enregistrés) — pour vérifier le format avant l'ouverture. Ne crée aucune commande ni écriture fiscale.
        </p>
        <TicketPrintLayer job={testPrint} onDone={() => setTestPrint(null)} restaurant={restaurant} settings={settings} />
      </Surface>

      <Surface style={{ padding: 18, marginBottom: 16 }}>
        <strong style={{ ...FF }}>📧 Connexion Gmail</strong>
        <PosConnectSection restaurant={restaurant} demoMode={store.demoMode} />
        <GmailConnectSection restaurant={restaurant} />
      </Surface>

      <Surface style={{ padding: 18, marginBottom: 16 }}>
        <strong style={{ ...FF }}>🎨 Personnalisation du menu client</strong>
        <p style={{ ...FF, fontSize: 13, color: C.textSecondary, marginTop: 6 }}>3 zones de fond : écran d'accueil, bandeau supérieur, corps du menu. Téléversez vos images dans le bucket Storage « assets ».</p>
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          {["Écran d'accueil", "Bandeau", "Corps"].map((z) => (
            <div key={z} style={{ flex: "1 1 120px", border: `1px dashed ${C.borderStrong}`, borderRadius: 12, padding: 16, textAlign: "center", ...FF, fontSize: 13, color: C.textSecondary }}>🖼️ {z}</div>
          ))}
        </div>
      </Surface>

      <Surface style={{ padding: 18 }}>
        <strong style={{ ...FF, color: C.accent }}>Zone de danger</strong>
        <p style={{ ...FF, fontSize: 13, color: C.textSecondary, margin: "6px 0 10px" }}>Supprimer définitivement ce restaurant et toutes ses données.</p>
        <Btn variant="red" onClick={() => toast("Confirmation requise (démo)", "info")}>Supprimer le restaurant</Btn>
      </Surface>
    </div>
  );
}

/* ============================================================================
 * INTÉGRATION CAISSE (POS) VIA HUBRISE
 *
 * HubRise est un middleware : Wegemo ne parle qu'à son API, et HubRise traduit
 * vers la caisse du restaurateur (CLYO aujourd'hui, une autre demain sans
 * travail supplémentaire ici). Le token d'accès n'est jamais exposé au
 * navigateur : il vit dans pos_connections, table sans policy RLS, et cet
 * écran lit l'état via la fonction get_pos_connection_status().
 * ==========================================================================*/
const POS_STATUS_UI = {
  connected: { label: "Connectée", color: C.accentGreen, dot: "●" },
  error: { label: "Erreur", color: C.accent, dot: "●" },
  disconnected: { label: "Non connectée", color: C.textTertiary, dot: "○" },
};

const POS_SYNC_UI = {
  accepted: { label: "Acceptée en caisse", color: C.accentGreen },
  sent: { label: "Transmise", color: C.accentBlue },
  pending: { label: "En attente", color: C.accentOrange },
  rejected: { label: "Refusée", color: C.accent },
  failed: { label: "Échec", color: C.accent },
  not_applicable: { label: "—", color: C.textTertiary },
};

function PosConnectSection({ restaurant, demoMode }) {
  const toast = useToast();
  const [conn, setConn] = useState(null);
  const [logs, setLogs] = useState([]);
  const [busy, setBusy] = useState(false);
  const clientId = import.meta.env.VITE_HUBRISE_CLIENT_ID;

  const load = useCallback(async () => {
    if (demoMode || !hasSupabase) return;
    const { data } = await supabase.rpc("get_pos_connection_status", { p_restaurant_id: restaurant.id });
    setConn(Array.isArray(data) ? data[0] ?? null : data ?? null);
    const { data: l } = await supabase
      .from("pos_sync_log")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .order("created_at", { ascending: false })
      .limit(8);
    setLogs(l || []);
  }, [restaurant.id, demoMode]);

  // load() est asynchrone : ses setState ont lieu après await, pas dans le
  // corps de l'effet. La règle ne sait pas le distinguer d'un setState direct.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  // Retour du flux OAuth HubRise : le code arrive en query string.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const rid = sessionStorage.getItem("wgm_hubrise_rid");
    if (!code || rid !== restaurant.id) return;
    sessionStorage.removeItem("wgm_hubrise_rid");
    window.history.replaceState({}, "", window.location.pathname);
    (async () => {
      setBusy(true);
      try {
        const res = await callFunction("hubrise-connect", {
          code, restaurant_id: restaurant.id,
          redirect_uri: `${window.location.origin}${window.location.pathname}`,
        });
        if (res?.warning) toast(`Connectée, mais : ${res.warning}`, "info");
        else toast("Caisse connectée", "success");
        await load();
      } catch (e) {
        toast(e.message || "Échec de la connexion", "error");
      } finally { setBusy(false); }
    })();
  }, [restaurant.id, load, toast]);

  const connect = () => {
    if (demoMode || !hasSupabase) return toast("(Démo) Connexion caisse indisponible", "info");
    if (!clientId) return toast("VITE_HUBRISE_CLIENT_ID non configuré", "error");
    sessionStorage.setItem("wgm_hubrise_rid", restaurant.id);
    const redirect = `${window.location.origin}${window.location.pathname}`;
    const url = `https://manager.hubrise.com/oauth2/v1/authorize?client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirect)}` +
      `&scope=${encodeURIComponent("location[orders.write,catalog.write]")}`;
    window.location.href = url;
  };

  const syncCatalog = async () => {
    setBusy(true);
    try {
      let res = await callFunction("hubrise-sync-catalog", { restaurant_id: restaurant.id });

      // Un catalogue existant et non vide a été trouvé sur ce point de vente,
      // jamais géré par Wegemo jusqu'ici : on montre son contenu réel avant
      // de laisser l'écraser, plutôt que de remplacer en silence des produits
      // potentiellement déjà configurés côté caisse.
      if (res?.needs_confirmation) {
        const names = (res.existing_product_names || []).join(", ");
        const more = res.existing_product_count > (res.existing_product_names?.length || 0) ? "…" : "";
        const proceed = window.confirm(
          `Ce point de vente a déjà un catalogue HubRise${res.existing_name ? ` (« ${res.existing_name} »)` : ""} avec ${res.existing_product_count} produit(s)${names ? " : " + names + more : ""}.\n\n` +
          `Synchroniser le remplacera ENTIÈREMENT par le menu Wegemo. Continuer ?`
        );
        if (!proceed) { setBusy(false); return; }
        res = await callFunction("hubrise-sync-catalog", { restaurant_id: restaurant.id, confirm: true });
      }

      toast(`Catalogue envoyé : ${res.products} produits`, "success");
      await load();
    } catch (e) {
      toast(e.message || "Échec de la synchronisation", "error");
    } finally { setBusy(false); }
  };

  const disconnect = async () => {
    if (!window.confirm("Déconnecter la caisse ? Les commandes ne seront plus transmises.")) return;
    setBusy(true);
    try {
      await supabase.rpc("disconnect_pos", { p_restaurant_id: restaurant.id });
      toast("Caisse déconnectée", "success");
      await load();
    } catch (e) {
      toast(e.message || "Erreur", "error");
    } finally { setBusy(false); }
  };

  const status = conn?.status || "disconnected";
  const ui = POS_STATUS_UI[status] || POS_STATUS_UI.disconnected;

  return (
    <Surface style={{ padding: 20, marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <strong style={{ ...FF, fontSize: 16 }}>🧾 Caisse (CLYO via HubRise)</strong>
          <p style={{ ...FF, fontSize: 13, color: C.textSecondary, marginTop: 4 }}>
            Envoie les commandes QR code sur l'écran de caisse, en paiement sur place.
          </p>
        </div>
        <span style={{ ...FF, fontSize: 13, fontWeight: 700, color: ui.color }}>
          {ui.dot} {ui.label}
        </span>
      </div>

      {status === "error" && conn?.last_error && (
        <p style={{ ...FF, fontSize: 12, color: C.accent, marginTop: 10, wordBreak: "break-word" }}>
          {conn.last_error}
        </p>
      )}

      {conn?.hubrise_location_id && (
        <div style={{ ...FF, fontSize: 12, color: C.textSecondary, marginTop: 10, lineHeight: 1.6 }}>
          <div>Location HubRise : <code>{conn.hubrise_location_id}</code></div>
          <div>
            Catalogue : {conn.catalog_synced_at
              ? `synchronisé le ${new Date(conn.catalog_synced_at).toLocaleString("fr-FR")}`
              : "jamais synchronisé"}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        {status === "connected" ? (
          <>
            <Btn variant="primary" size="sm" disabled={busy} onClick={syncCatalog}>
              {busy ? "…" : "Synchroniser le menu"}
            </Btn>
            <Btn variant="secondary" size="sm" disabled={busy} onClick={disconnect}>Déconnecter</Btn>
          </>
        ) : (
          <Btn variant="primary" size="sm" disabled={busy} onClick={connect}>
            {busy ? "…" : "Connecter ma caisse"}
          </Btn>
        )}
      </div>

      {!conn?.catalog_synced_at && status === "connected" && (
        <p style={{ ...FF, fontSize: 12, color: C.accentOrange, marginTop: 10 }}>
          Synchronise le menu avant la première commande : la caisse ne reconnaît
          que les articles présents dans son catalogue.
        </p>
      )}

      {logs.length > 0 && (
        <div style={{ marginTop: 16, borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
          <strong style={{ ...FF, fontSize: 12, color: C.textSecondary }}>Dernières transmissions</strong>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            {logs.map((l) => (
              <div key={l.id} style={{ ...FF, fontSize: 11, display: "flex", gap: 8, alignItems: "baseline" }}>
                <span style={{ color: l.ok ? C.accentGreen : C.accent }}>{l.ok ? "✓" : "✕"}</span>
                <span style={{ color: C.textTertiary, whiteSpace: "nowrap" }}>
                  {new Date(l.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span style={{ color: C.textSecondary, whiteSpace: "nowrap" }}>{l.action}</span>
                <span style={{ color: C.textTertiary, overflow: "hidden", textOverflow: "ellipsis" }}>{l.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Surface>
  );
}

function GmailConnectSection({ restaurant }) {
  const toast = useToast();
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const connect = () => {
    if (!clientId) return toast("VITE_GOOGLE_CLIENT_ID non configuré", "error");
    const redirect = `${window.location.origin}/oauth/gmail`;
    sessionStorage.setItem("wgm_gmail_rid", restaurant.id);
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&scope=${encodeURIComponent("email https://www.googleapis.com/auth/gmail.send")}&access_type=offline&prompt=consent`;
    window.location.href = url;
  };
  return (
    <div style={{ marginTop: 10 }}>
      <Btn variant="subtle" onClick={connect}>Connecter un compte Gmail</Btn>
    </div>
  );
}

/* ============================================================================
 * KITCHEN VIEW
 * ==========================================================================*/
function useOrderSound() {
  const ctxRef = useRef(null);
  return useCallback(() => {
    try {
      if (!ctxRef.current) ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = ctxRef.current;
      [0, 0.18, 0.36].forEach((delay, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = 880 + i * 110;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + delay + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + 0.16);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + 0.18);
      });
    } catch { /* ignore */ }
  }, []);
}

/* ============================================================================
 * TICKET DE CAISSE (impression)
 *
 * Remplace le flux CLYO côté impression : dès qu'une commande arrive côté
 * SaaS, on déclenche l'impression navigateur sur l'imprimante système. Le
 * ticket est scopé via `visibility` (et non `display`) pour rester imprimable
 * quel que soit l'endroit du DOM où `TicketPrintLayer` est monté.
 * ==========================================================================*/
function useRestaurantSettings(restaurantId, demoMode) {
  const [settings, setSettings] = useState({});
  useEffect(() => {
    if (demoMode || !hasSupabase) return;
    let active = true;
    supabase.from("restaurant_settings").select("*").eq("restaurant_id", restaurantId).maybeSingle()
      .then(({ data }) => { if (active) setSettings(data || {}); });
    return () => { active = false; };
  }, [restaurantId, demoMode]);
  return settings;
}

// File d'impression automatique, partagée entre l'écran Cuisine et le
// dashboard (n'importe quel onglet) : dès qu'une commande jusque-là inconnue
// apparaît dans `store.orders`, elle part à l'impression. Les ventes
// comptoir (onglet Vente) sont exclues — elles ont déjà leur propre ticket
// imprimé immédiatement à l'encaissement ; les réimprimer ici doublerait le
// papier consommé pour la même commande.
//
// `store.orders` part de [] avant que le chargement initial (asynchrone)
// n'arrive : sans la garde sur `store.loading`, ce passage de [] aux vraies
// commandes serait lui-même vu comme "des commandes toutes neuves" et tout
// imprimerait d'un coup à l'ouverture de l'écran.
function useAutoPrintQueue(store, autoPrintEnabled) {
  const prevIds = useRef(null);
  const [printQueue, setPrintQueue] = useState([]);

  useEffect(() => {
    if (store.loading) return;
    const ids = new Set(store.orders.map((o) => o.id));
    if (prevIds.current === null) { prevIds.current = ids; return; }
    if (autoPrintEnabled !== false) {
      const fresh = store.orders.filter((o) => !prevIds.current.has(o.id) && o.customer_name !== "Comptoir");
      // Deux documents par commande, l'un après l'autre : le ticket client
      // (avec prix et TVA) puis le bon de cuisine juste derrière (sans prix,
      // pour la brigade) — imprimés en deux temps sur la même imprimante.
      if (fresh.length) {
        setPrintQueue((q) => [...q, ...fresh.flatMap((o) => [o, { ...o, kind: "kitchen" }])]);
      }
    }
    prevIds.current = ids;
  }, [store.orders, store.loading, autoPrintEnabled]);

  return {
    printing: printQueue[0] ?? null,
    dequeue: () => setPrintQueue((q) => q.slice(1)),
    enqueue: (order) => setPrintQueue((q) => [...q, order]),
  };
}

// Ticket de caisse au format français : numéro fiscal séquentiel, ventilation
// de TVA par taux, mentions légales de l'établissement. La ventilation vient
// de la base (figée à l'encaissement par create_order_secure) et n'est jamais
// recalculée à l'impression : réimprimer un ticket doit redonner exactement le
// même document, même si les prix de la carte ont changé depuis.
// `detailed=false` produit une note pour justificatif professionnel (note de
// frais) : mentions légales, numéro fiscal, total et TVA, mais sans la liste
// des plats — ce que la plupart des employeurs demandent, sans exposer le
// détail (alcool compris) de ce qui a été consommé.
function ReceiptTicket({ order, restaurant, settings, detailed = true }) {
  if (!order) return null;
  const items = order.items || [];
  const when = order.created_at ? new Date(order.created_at) : new Date();
  const tableLabel = order.order_type === "takeaway"
    ? "À emporter"
    : (order.table?.label || (order.table?.number != null ? `Table ${order.table.number}` : ""));
  const line = { display: "flex", justifyContent: "space-between", gap: 8 };
  const vat = Array.isArray(order.vat_breakdown) ? order.vat_breakdown : [];
  const totalHt = vat.reduce((s, v) => s + Number(v.base_ht || 0), 0);
  const totalVat = vat.reduce((s, v) => s + Number(v.vat || 0), 0);
  const num = order.fiscal_number || (order.id || "").slice(0, 8).toUpperCase();
  const isTest = order.fiscal_number === "TEST";

  return (
    // Largeur adaptative et non fixée en dur : le pilote d'imprimante impose
    // sa propre taille de papier (48mm chez un utilisateur, 80mm chez un
    // autre) et le CSS @page n'est qu'une préférence qu'il peut ignorer. Un
    // `width: 72mm` en dur débordait donc et se faisait rogner. `width: 100%`
    // laisse le ticket se conformer au papier réel, `maxWidth` l'empêche de
    // s'étaler au-delà de la zone imprimable d'un rouleau 80mm standard, et
    // `border-box` évite que le padding s'ajoute à cette largeur.
    <div style={{ width: "100%", maxWidth: "72mm", boxSizing: "border-box", padding: "2mm", fontFamily: "'Courier New', Courier, monospace", fontSize: 16, fontWeight: 700, lineHeight: 1.35, color: "#000", background: "#fff" }}>
      {isTest && (
        <div style={{ textAlign: "center", fontWeight: 700, border: "2px solid #000", padding: "4px 0", marginBottom: 6 }}>
          *** TICKET TEST — NE PAS ENCAISSER ***
        </div>
      )}
      <div style={{ textAlign: "center", marginBottom: 6 }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{restaurant?.name}</div>
        {settings?.ticket_address && <div>{settings.ticket_address}</div>}
        {settings?.ticket_phone && <div>Tél. {settings.ticket_phone}</div>}
        {settings?.ticket_tax_id && <div>SIRET {settings.ticket_tax_id}</div>}
        {settings?.ticket_vat_number && <div>TVA {settings.ticket_vat_number}</div>}
      </div>
      <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
      <div style={{ fontWeight: 700 }}>Ticket n° {num}</div>
      <div>{when.toLocaleDateString("fr-FR")} à {when.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</div>
      {tableLabel && <div>{tableLabel}</div>}
      {order.customer_name && <div>Client : {order.customer_name}</div>}
      <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />

      {detailed ? (
        <>
          {items.map((it, i) => (
            <div key={i} style={line}>
              <span>{it.quantity}× {it.name}{it.detail ? ` (${it.detail})` : ""}</span>
              <span>{eur(Number(it.price || 0) * it.quantity)}</span>
            </div>
          ))}
          <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
        </>
      ) : (
        <div style={{ fontStyle: "italic", color: "#333" }}>Note — justificatif</div>
      )}
      {Number(order.discount) > 0 && (
        <>
          <div style={line}><span>Sous-total</span><span>{eur(order.subtotal)}</span></div>
          <div style={line}><span>Remise</span><span>-{eur(order.discount)}</span></div>
        </>
      )}
      <div style={{ ...line, fontWeight: 700, fontSize: 20 }}>
        <span>TOTAL TTC</span><span>{eur(order.total)}</span>
      </div>

      {/* Ventilation de TVA : obligatoire sur une note de restaurant. Une
          seule colonne de texte par taux plutôt qu'un tableau à largeurs
          fixes en pixels : sur certains pilotes d'imprimante à ticket, une
          largeur en px dans un contenu pensé en mm n'est pas convertie
          correctement et pousse les valeurs hors de la zone imprimable —
          les libellés à largeur automatique restent visibles, les colonnes
          à largeur fixe disparaissent. Une ligne de texte simple élimine ce
          risque, quel que soit le pilote. */}
      {vat.length > 0 && (
        <>
          <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
          <div style={line}><span>Dont TVA</span><span>{eur(totalVat)}</span></div>
          <div style={line}><span>Total HT</span><span>{eur(totalHt)}</span></div>
          {vat.map((v, i) => (
            <div key={i} style={{ fontSize: 14 }}>
              {Number(v.rate).toFixed(1).replace(".", ",")}% {eur(v.base_ht)} HT {eur(v.vat)} TVA {eur(v.total_ttc ?? v.base_ht + v.vat)} TTC
            </div>
          ))}
        </>
      )}

      <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
      <div>
        {order.payment_method === "cash" ? "Réglé en espèces"
          : order.payment_method === "card" ? "Réglé par carte bancaire"
            : order.payment_mode === "pay_at_counter" ? "À encaisser en caisse" : ""}
      </div>
      {order.note && <div>Note : {order.note}</div>}
      {settings?.ticket_footer && <div style={{ textAlign: "center", marginTop: 10 }}>{settings.ticket_footer}</div>}
      <div style={{ textAlign: "center", marginTop: 8, fontSize: 13 }}>
        Merci de votre visite — à bientôt !
      </div>
      {/* Marge de papier vierge avant la coupe : beaucoup d'imprimantes à
          ticket ont besoin de faire défiler un peu de papier après le
          contenu pour que le massicot automatique s'engage correctement.
          Sans ça, un ticket court (peu d'articles) peut ne pas se couper du
          tout, ou se couper en plein milieu du texte. */}
      <div style={{ height: "30mm" }} />
    </div>
  );
}

// Bon de cuisine : ce que la brigade prépare, sans aucun prix ni mention
// fiscale — un bon de cuisine n'est pas un document de caisse, il n'a pas à
// en avoir l'apparence. Grande police et repères visuels forts (table,
// couverts) pensés pour être lus vite, de loin, dans le feu du service.
function KitchenTicket({ order }) {
  if (!order) return null;
  const items = order.items || [];
  const when = order.created_at ? new Date(order.created_at) : new Date();
  const tableLabel = order.order_type === "takeaway"
    ? "À EMPORTER"
    : (order.table?.label || (order.table?.number != null ? `TABLE ${order.table.number}` : "")).toString().toUpperCase();
  const num = order.fiscal_number || (order.id || "").slice(0, 8).toUpperCase();

  return (
    <div style={{ width: "100%", maxWidth: "72mm", boxSizing: "border-box", padding: "2mm", fontFamily: "'Courier New', Courier, monospace", fontSize: 18, fontWeight: 700, lineHeight: 1.4, color: "#000", background: "#fff" }}>
      <div style={{ textAlign: "center", fontWeight: 700, fontSize: 20 }}>🍳 BON DE CUISINE</div>
      <div style={{ borderTop: "2px dashed #000", margin: "6px 0" }} />
      {tableLabel && <div style={{ textAlign: "center", fontWeight: 700, fontSize: 26 }}>{tableLabel}</div>}
      {order.covers != null && (
        <div style={{ textAlign: "center" }}>{order.covers} couvert{order.covers > 1 ? "s" : ""}</div>
      )}
      <div style={{ textAlign: "center" }}>
        {when.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} — n° {num}
      </div>
      <div style={{ borderTop: "1px dashed #000", margin: "8px 0" }} />
      {items.map((it, i) => (
        <div key={i} style={{ marginBottom: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 20 }}>{it.quantity}× {it.name}</div>
          {it.detail && <div style={{ fontStyle: "italic", marginLeft: 8 }}>↳ {it.detail}</div>}
        </div>
      ))}
      {order.note && (
        <>
          <div style={{ borderTop: "2px dashed #000", margin: "8px 0" }} />
          <div style={{ fontWeight: 700 }}>📝 {order.note}</div>
        </>
      )}
      {/* Marge de papier vierge avant la coupe, voir ReceiptTicket. */}
      <div style={{ height: "30mm" }} />
    </div>
  );
}

// Monté une fois par écran (Cuisine ou Commandes) : reçoit une commande à
// imprimer via `job`, déclenche window.print() scopé au ticket, et prévient
// `onDone` une fois l'impression terminée (ou annulée) pour libérer la file.
// `job.kind === "kitchen"` imprime le bon de cuisine, sinon le ticket client.
function TicketPrintLayer({ job, onDone, restaurant, settings }) {
  useEffect(() => {
    if (!job) return;
    document.body.classList.add("wegemo-printing-ticket");
    const finish = () => {
      document.body.classList.remove("wegemo-printing-ticket");
      window.removeEventListener("afterprint", finish);
      onDone();
    };
    window.addEventListener("afterprint", finish);
    const t = setTimeout(() => window.print(), 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job]);

  if (!job) return null;
  return (
    <div id="wegemo-ticket-print">
      <style>{`
        /* @page n'est qu'une PRÉFÉRENCE : le pilote d'imprimante garde la
           main sur la taille de papier réelle (un poste a été observé en
           Custom 48mm alors que le rouleau physique fait 80mm), et les
           marges par défaut (~10mm) rognent en plus les bords. D'où deux
           précautions complémentaires ici : marges à zéro, et surtout aucune
           largeur fixe — le conteneur est en width:100% pour se conformer
           au papier annoncé par le pilote au lieu de déborder d'une taille
           imposée en dur. Cette feuille de style n'existe dans le DOM que
           pendant l'impression d'un ticket (le composant retourne null
           sinon), donc rien ici n'affecte le « Rapport Z » de l'onglet
           Caisse ni aucune autre impression. */
        @media print {
          @page { size: 80mm auto; margin: 0; }
          html, body { margin: 0 !important; }
          body.wegemo-printing-ticket * { visibility: hidden; }
          body.wegemo-printing-ticket #wegemo-ticket-print,
          body.wegemo-printing-ticket #wegemo-ticket-print * { visibility: visible; }
          body.wegemo-printing-ticket #wegemo-ticket-print { position: fixed; top: 0; left: 0; width: 100%; margin: 0; }
        }
        @media screen { #wegemo-ticket-print { position: fixed; left: -9999px; top: 0; } }
      `}</style>
      {job.kind === "kitchen"
        ? <KitchenTicket order={job} />
        : <ReceiptTicket order={job} restaurant={restaurant} settings={settings} detailed={job.detailed !== false} />}
    </div>
  );
}

function KitchenView({ restaurant, onExit }) {
  const toast = useToast();
  const store = useStore(restaurant.id);
  const settings = useRestaurantSettings(restaurant.id, store.demoMode);
  const playSound = useOrderSound();
  const [alert, setAlert] = useState(false);
  const prevCount = useRef(0);
  const { printing, dequeue, enqueue } = useAutoPrintQueue(store, settings.auto_print_enabled);

  useEffect(() => {
    const pending = store.orders.filter((o) => o.status === "PENDING").length;
    if (pending > prevCount.current && prevCount.current !== 0) {
      playSound();
      setAlert(true);
    }
    prevCount.current = pending;
  }, [store.orders, playSound]);

  const cols = [
    { status: "PENDING", title: "🆕 Nouvelles", color: C.accentOrange },
    { status: "PREPARING", title: "👨‍🍳 En préparation", color: C.accentBlue },
    { status: "READY", title: "✅ Prêtes", color: C.accentGreen },
  ];

  const advance = async (o) => {
    const next = o.status === "PENDING" ? "PREPARING" : o.status === "PREPARING" ? "READY" : "DONE";
    if (!store.demoMode && hasSupabase) {
      const { error } = await supabase.from("orders").update({ status: next }).eq("id", o.id);
      if (error) return toast(error.message || "Échec de la mise à jour", "error");
      store.reload();
    } else {
      store.setOrders((p) => p.map((x) => (x.id === o.id ? { ...x, status: next } : x)));
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: C.dark, padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <Logo size={24} dark />
        <strong style={{ ...FF, color: C.white }}>👨‍🍳 Cuisine — {restaurant.name}</strong>
        <Btn variant="subtle" size="sm" onClick={onExit}>← Quitter</Btn>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
        {cols.map((col) => (
          <div key={col.status}>
            <h3 style={{ ...FF, color: col.color, marginBottom: 10 }}>{col.title}</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {store.orders.filter((o) => o.status === col.status).map((o) => {
                const mins = Math.floor((Date.now() - new Date(o.created_at).getTime()) / 60000);
                const late = mins > 20;
                return (
                  <div key={o.id} style={{ background: C.surface, borderRadius: 14, padding: 14, border: late ? `2px solid ${C.accent}` : "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong style={{ ...FF }}>Table {o.table?.number}</strong>
                      <span style={{ ...FF, fontSize: 12, color: late ? C.accent : C.textTertiary }}>{mins} min</span>
                    </div>
                    <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                      <Tag color={o.order_type === "takeaway" ? C.accentPurple : C.accentBlue}>{o.order_type === "takeaway" ? "À emporter" : "Sur place"}</Tag>
                      {o.payment_method === "cash" && <Tag color={o.cash_collected ? C.accentGreen : C.accentOrange}>{o.cash_collected ? "Encaissé" : "À encaisser"}</Tag>}
                    </div>
                    <ul style={{ ...FF, fontSize: 14, margin: "8px 0", paddingLeft: 18 }}>
                      {(o.items || []).map((it, i) => <li key={i}>{it.quantity}× {it.emoji} {it.name}</li>)}
                    </ul>
                    {o.note && <p style={{ ...FF, fontSize: 13, color: C.accent }}>📝 {o.note}</p>}
                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                      <Btn variant="primary" size="sm" style={{ flex: 1 }} onClick={() => advance(o)}>
                        {o.status === "PENDING" ? "Commencer" : o.status === "PREPARING" ? "Marquer prête" : "Servie"}
                      </Btn>
                      <Btn variant="subtle" size="sm" title="Ticket détaillé" onClick={() => enqueue({ ...o, detailed: true })}>🖨️</Btn>
                      <Btn variant="subtle" size="sm" title="Note sans détail (justificatif)" onClick={() => enqueue({ ...o, detailed: false })}>📄</Btn>
                      <Btn variant="subtle" size="sm" title="Bon de cuisine" onClick={() => enqueue({ ...o, kind: "kitchen" })}>🍳</Btn>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <TicketPrintLayer job={printing} onDone={dequeue} restaurant={restaurant} settings={settings} />

      {alert && (
        <div onClick={() => setAlert(false)} style={{ position: "fixed", inset: 0, background: "rgba(255,55,95,.92)", zIndex: 2000, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <div style={{ fontSize: 90, animation: "pulse 0.6s infinite" }}>🔔</div>
          <h1 style={{ ...FF, color: C.white, fontSize: 36, fontWeight: 900 }}>Nouvelle commande !</h1>
          <p style={{ ...FF, color: C.white, opacity: 0.9 }}>Cliquez pour fermer</p>
        </div>
      )}
    </div>
  );
}

/* ============================================================================
 * FRANCHISE DASHBOARD (multi-restaurant group view)
 * ==========================================================================*/
function FranchiseDashboard({ group, demoMode, onExit }) {
  const toast = useToast();
  const [tab, setTab] = useState("performance");
  const [restaurants, setRestaurants] = useState(demoMode ? DEMO_FRANCHISE_RESTAURANTS : []);
  const [members, setMembers] = useState([]);
  const [stats, setStats] = useState(demoMode ? DEMO_FRANCHISE_STATS : { revenue_today: 0, orders_today: 0, avg_basket: 0, customers: 0 });

  useEffect(() => {
    if (demoMode || !hasSupabase) return;
    (async () => {
      const { data: rs } = await supabase.from("restaurants").select("*").eq("group_id", group.id);
      const { data: ms } = await supabase.from("group_members").select("*").eq("group_id", group.id);
      const list = (rs || []).map((r) => ({ id: r.id, name: r.name, region: r.region || "—", revenue_today: 0, orders_today: 0, avg_basket: 0, growth: 0 }));
      setRestaurants(list);
      setMembers(ms || []);
      setStats({
        revenue_today: list.reduce((s, r) => s + r.revenue_today, 0),
        orders_today: list.reduce((s, r) => s + r.orders_today, 0),
        avg_basket: 0,
        customers: 0,
      });
    })();
  }, [group, demoMode]);

  const kpis = [
    { label: "CA groupe (jour)", value: eur(stats.revenue_today), color: C.accentGreen },
    { label: "Commandes", value: stats.orders_today, color: C.accentBlue },
    { label: "Panier moyen", value: eur(stats.avg_basket), color: C.accentOrange },
    { label: "Clients", value: stats.customers, color: C.accentPurple },
  ];
  const alerts = restaurants.filter((r) => r.growth < 0);

  return (
    <div style={{ minHeight: "100vh", background: C.bg }}>
      <div style={{ background: C.dark, padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 28 }}>{group.logo_emoji}</span>
          <div>
            <strong style={{ ...FF, color: C.white, fontSize: 18 }}>{group.name}</strong>
            <div style={{ ...FF, color: C.textTertiary, fontSize: 12 }}>{restaurants.length} établissements</div>
          </div>
        </div>
        <Btn variant="subtle" size="sm" onClick={onExit}>← Quitter</Btn>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
          {[["performance", "📈 Performance"], ["team", "👥 Équipe"], ["campaigns", "✉️ Campagnes"], ["calendar", "📅 Calendrier"]].map(([id, lbl]) => (
            <button key={id} onClick={() => setTab(id)} style={{ ...FF, padding: "8px 16px", borderRadius: 11, fontWeight: 600, fontSize: 14, border: `1px solid ${tab === id ? C.text : C.border}`, background: tab === id ? C.text : C.surface, color: tab === id ? C.white : C.text }}>{lbl}</button>
          ))}
        </div>

        {tab === "performance" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 16 }}>
              {kpis.map((k) => (
                <Surface key={k.label} style={{ padding: 16 }}>
                  <span style={{ ...FF, fontSize: 13, color: C.textSecondary }}>{k.label}</span>
                  <div style={{ ...FF, fontSize: 24, fontWeight: 900, color: k.color, marginTop: 4 }}>{k.value}</div>
                </Surface>
              ))}
            </div>
            {alerts.length > 0 && (
              <Surface style={{ padding: 16, marginBottom: 16, borderColor: `${C.accent}55` }}>
                <strong style={{ ...FF, color: C.accent }}>⚠️ Établissements en baisse</strong>
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                  {alerts.map((r) => (
                    <details key={r.id} style={{ ...FF, fontSize: 14 }}>
                      <summary style={{ cursor: "pointer" }}>{r.name} — {r.growth}% vs hier</summary>
                      <p style={{ color: C.textSecondary, marginTop: 6, paddingLeft: 16 }}>
                        Recommandations : relancer les clients inactifs par campagne email, activer une promo Happy Hour, vérifier les ruptures de stock.
                      </p>
                    </details>
                  ))}
                </div>
              </Surface>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
              {restaurants.map((r) => (
                <Surface key={r.id} style={{ padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong style={{ ...FF }}>{r.name}</strong>
                    <Tag color={r.growth >= 0 ? C.accentGreen : C.accent}>{r.growth >= 0 ? "▲" : "▼"} {Math.abs(r.growth)}%</Tag>
                  </div>
                  <div style={{ ...FF, fontSize: 12, color: C.textTertiary, marginBottom: 8 }}>{r.region}</div>
                  <Row label="CA jour" value={eur(r.revenue_today)} />
                  <Row label="Commandes" value={r.orders_today} />
                  <Row label="Panier moyen" value={eur(r.avg_basket)} />
                </Surface>
              ))}
            </div>
          </>
        )}

        {tab === "team" && <FranchiseTeam group={group} demoMode={demoMode} members={members} setMembers={setMembers} />}

        {tab === "campaigns" && (
          <Surface style={{ padding: 20 }}>
            <strong style={{ ...FF }}>Campagne multi-restaurants</strong>
            <p style={{ ...FF, fontSize: 13, color: C.textSecondary, margin: "6px 0 12px" }}>Ciblez un segment de clients sur une sélection d'établissements.</p>
            <div style={{ marginBottom: 12 }}>
              <span style={{ ...FF, fontSize: 13, fontWeight: 600, color: C.textSecondary }}>Établissements</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                {restaurants.map((r) => <Tag key={r.id} color={C.accentBlue}>{r.name}</Tag>)}
              </div>
            </div>
            <InputField label="Sujet" placeholder="Nouveauté dans tous nos restaurants !" />
            <textarea placeholder="<h1>...</h1>" style={{ ...FF, width: "100%", minHeight: 90, padding: 12, borderRadius: 12, border: `1px solid ${C.borderStrong}`, outline: "none" }} />
            <Btn variant="primary" style={{ marginTop: 10 }} onClick={() => toast("(Démo) Campagne groupe programmée", "success")}>Envoyer au groupe</Btn>
          </Surface>
        )}

        {tab === "calendar" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
            {SEASONAL_EVENTS.slice(0, 12).map((ev) => (
              <Surface key={ev.id} style={{ padding: 16, borderLeft: `4px solid ${ev.color}` }}>
                <div style={{ fontSize: 24 }}>{ev.emoji}</div>
                <strong style={{ ...FF, fontSize: 15 }}>{ev.name}</strong>
                <div style={{ ...FF, fontSize: 12, color: C.textTertiary }}>{ev.date}</div>
                <p style={{ ...FF, fontSize: 12, color: C.textSecondary, marginTop: 4 }}>{ev.idea}</p>
              </Surface>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FranchiseTeam({ group, demoMode, members, setMembers }) {
  const toast = useToast();
  const [form, setForm] = useState({ email: "", role: "manager", regions: "" });
  const list = demoMode
    ? [{ id: "gm1", email: "manager.lyon@demo.fr", role: "manager", regions: ["Rhône"] }, { id: "gm2", email: "chef.paris@demo.fr", role: "cuisine", regions: ["Île-de-France"] }]
    : members;

  const invite = async (e) => {
    e.preventDefault();
    const regions = form.regions.split(",").map((s) => s.trim()).filter(Boolean);
    if (!demoMode && hasSupabase) {
      const { data } = await supabase.from("group_members").insert({ group_id: group.id, email: form.email, role: form.role, regions }).select().single();
      if (data) setMembers((p) => [...p, data]);
    }
    toast("Invitation envoyée", "success");
    setForm({ email: "", role: "manager", regions: "" });
  };

  return (
    <div>
      <Surface style={{ padding: 18, marginBottom: 16 }}>
        <strong style={{ ...FF }}>Inviter un membre</strong>
        <form onSubmit={invite} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginTop: 10 }}>
          <div style={{ flex: "1 1 200px" }}><InputField label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
          <label style={{ ...FF, marginBottom: 14 }}>
            <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: C.textSecondary, marginBottom: 6 }}>Rôle</span>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} style={{ ...FF, padding: "12px 14px", borderRadius: 12, border: `1px solid ${C.borderStrong}` }}>
              <option value="manager">Manager</option>
              <option value="cuisine">Cuisine</option>
            </select>
          </label>
          <div style={{ flex: "1 1 160px" }}><InputField label="Régions (séparées par ,)" value={form.regions} onChange={(e) => setForm({ ...form, regions: e.target.value })} /></div>
          <Btn type="submit" variant="primary">Inviter</Btn>
        </form>
      </Surface>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {list.map((m) => (
          <Surface key={m.id} style={{ padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Avatar name={m.email} color={m.role === "cuisine" ? C.accentOrange : C.accentBlue} />
              <div>
                <strong style={{ ...FF }}>{m.email}</strong>
                <div style={{ ...FF, fontSize: 12, color: C.textSecondary }}>{(m.regions || []).join(", ") || "Toutes régions"}</div>
              </div>
            </div>
            <Tag color={m.role === "cuisine" ? C.accentOrange : C.accentBlue}>{m.role}</Tag>
          </Surface>
        ))}
      </div>
    </div>
  );
}

/* ============================================================================
 * HOTEL GUEST PORTAL — scanned from the room QR (fully offline demo).
 * Not a menu: a hub of large blocks (check-in, room service, hotel services,
 * around the hotel, infos, concierge). Self check-in mirrors Booking/Airbnb
 * online check-in and feeds the dashboard Check-in board via localStorage.
 * ==========================================================================*/
const DEMO_CHECKIN_LS = "wgm_demo_checkins";
const readGuestCheckins = () => { try { return JSON.parse(localStorage.getItem(DEMO_CHECKIN_LS) || "[]"); } catch { return []; } };
const writeGuestCheckins = (list) => { try { localStorage.setItem(DEMO_CHECKIN_LS, JSON.stringify(list)); } catch { /* storage unavailable */ } };

function HotelGuestPortal({ room }) {
  const toast = useToast();
  const hotel = DEMO_HOTEL;
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  const [view, setView] = useState("home");
  const [cart, setCart] = useState([]);           // room service cart [{item, qty}]
  const [orders, setOrders] = useState([]);       // placed room-service orders
  const [requests, setRequests] = useState([]);   // service/concierge requests
  const [checkin, setCheckin] = useState(() => readGuestCheckins().find((c) => String(c.room) === String(room)) || null);
  const [msg, setMsg] = useState("");

  const total = cart.reduce((s, c) => s + c.item.price * c.qty, 0);
  const addItem = (item) => {
    setCart((p) => {
      const ex = p.find((c) => c.item.id === item.id);
      return ex ? p.map((c) => (c.item.id === item.id ? { ...c, qty: c.qty + 1 } : c)) : [...p, { item, qty: 1 }];
    });
  };
  const decItem = (item) => {
    setCart((p) => p.map((c) => (c.item.id === item.id ? { ...c, qty: c.qty - 1 } : c)).filter((c) => c.qty > 0));
  };

  const placeOrder = (method) => {
    const o = { id: uid(), items: cart, total, method, status: "Reçue ✓", at: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) };
    setOrders((p) => [o, ...p]);
    setCart([]);
    setView("room");
    toast(method === "room" ? `Commande envoyée — facturée sur la chambre ${room}` : "Commande envoyée — paiement à la livraison", "success");
    // Simulate the kitchen advancing the order (demo realism).
    setTimeout(() => setOrders((p) => p.map((x) => (x.id === o.id ? { ...x, status: "En préparation 👨‍🍳" } : x))), 8000);
    setTimeout(() => setOrders((p) => p.map((x) => (x.id === o.id ? { ...x, status: "En route vers votre chambre 🛎️" } : x))), 22000);
  };

  const addRequest = (label) => {
    setRequests((p) => [{ id: uid(), label, status: "Transmis à la réception ✓", at: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) }, ...p]);
    toast("Demande transmise à la réception", "success");
  };

  const header = (title, back = "home") => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
      <Btn variant="subtle" size="sm" onClick={() => setView(back)}>←</Btn>
      <h2 style={{ ...FF, fontWeight: 800, fontSize: 19 }}>{title}</h2>
    </div>
  );

  /* ---------- HOME (hub of large blocks) ---------- */
  const checkedOut = checkin && (checkin.status === "departing" || checkin.status === "checked_out") && checkin.express_checkout;
  const tiles = [
    !checkin && { id: "checkin", emoji: "🛎️", title: "Check-in en ligne", sub: "2 min — évitez l'attente à la réception", big: true, color: C.accentBlue },
    checkin && !checkedOut && { id: "checkout", emoji: "🧳", title: "Check-out express", sub: "Note de chambre, horaires, bagagerie — sans passer par la réception", big: true, color: C.accentOrange },
    { id: "room", emoji: "🍽️", title: "Room service", sub: "Carte, boissons, en-cas", badge: orders.filter((o) => !o.breakfast).length ? `${orders.filter((o) => !o.breakfast).length}` : null },
    { id: "breakfast", emoji: "🥐", title: "Petit-déjeuner", sub: "Buffet 7h – 10h30 · en chambre (+8€)", badge: orders.filter((o) => o.breakfast).length ? "⏰" : null },
    { id: "services", emoji: "🧖", title: "Services de l'hôtel", sub: "Spa, pressing, ménage, réveil…" },
    { id: "around", emoji: "📍", title: "Autour de vous", sub: "Événements, bons plans, partenaires" },
    { id: "info", emoji: "ℹ️", title: "Infos pratiques", sub: "Wi-Fi, petit-déj, check-out, parking" },
    { id: "concierge", emoji: "💬", title: "Conciergerie", sub: "Une demande ? On s'en occupe", badge: requests.length ? `${requests.length}` : null },
  ].filter(Boolean);

  if (view === "home") {
    return (
      <div style={{ minHeight: "100vh", background: C.bg }}>
        <div style={{ maxWidth: 560, margin: "0 auto", padding: 16 }}>
          {/* Hero */}
          <div style={{ background: `linear-gradient(135deg, ${C.dark}, #3A3A3C)`, borderRadius: 20, padding: "26px 20px", color: C.white, marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 34 }}>{hotel.logo_emoji}</div>
              <span style={{ ...FF, fontSize: 13, fontWeight: 800, background: "rgba(255,255,255,.15)", padding: "6px 14px", borderRadius: 999 }}>Chambre {room}</span>
            </div>
            <h1 style={{ ...FF, fontSize: 24, fontWeight: 900, margin: "12px 0 4px" }}>{hotel.name}</h1>
            <p style={{ ...FF, fontSize: 14, opacity: 0.75 }}>
              {checkedOut
                ? `Chambre libérée — merci pour votre séjour, ${checkin.guest_name.split(" ")[0]} ! 👋`
                : checkin ? `Bon séjour, ${checkin.guest_name.split(" ")[0]} — vous êtes enregistré ✓` : "Bienvenue ! Toute votre chambre, depuis votre téléphone."}
            </p>
          </div>

          {/* Tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {tiles.map((t) => (
              <button key={t.id} onClick={() => setView(t.id)} style={{
                ...FF, textAlign: "left", cursor: "pointer", border: `1px solid ${C.border}`,
                gridColumn: t.big ? "1 / -1" : "auto",
                background: t.big ? t.color : C.surface, color: t.big ? C.white : C.text,
                borderRadius: 18, padding: t.big ? "20px 18px" : "18px 14px", position: "relative",
                boxShadow: "0 2px 8px rgba(0,0,0,.05)",
              }}>
                <div style={{ fontSize: t.big ? 32 : 28 }}>{t.emoji}</div>
                <div style={{ fontWeight: 800, fontSize: t.big ? 18 : 15, marginTop: 8 }}>{t.title}</div>
                <div style={{ fontSize: 12.5, marginTop: 2, color: t.big ? "rgba(255,255,255,.8)" : C.textSecondary }}>{t.sub}</div>
                {t.badge && <span style={{ position: "absolute", top: 12, right: 12, background: C.accent, color: C.white, fontSize: 11, fontWeight: 800, padding: "3px 9px", borderRadius: 999 }}>{t.badge}</span>}
              </button>
            ))}
          </div>

          {/* Live activity */}
          {(orders.length > 0 || requests.length > 0) && (
            <Surface style={{ padding: 16, marginTop: 14 }}>
              <strong style={{ ...FF, fontSize: 14 }}>🕑 En cours</strong>
              {orders.map((o) => (
                <div key={o.id} style={{ ...FF, fontSize: 13, display: "flex", justifyContent: "space-between", gap: 8, marginTop: 8 }}>
                  <span>{o.breakfast ? "🥐" : "🍽️"} {o.items.map((c) => `${c.qty}× ${c.item.name}`).join(", ")}</span>
                  <span style={{ color: C.accentBlue, fontWeight: 700, whiteSpace: "nowrap" }}>{o.status}</span>
                </div>
              ))}
              {requests.map((r) => (
                <div key={r.id} style={{ ...FF, fontSize: 13, display: "flex", justifyContent: "space-between", gap: 8, marginTop: 8 }}>
                  <span>💬 {r.label}</span>
                  <span style={{ color: C.accentGreen, fontWeight: 700, whiteSpace: "nowrap" }}>{r.status}</span>
                </div>
              ))}
            </Surface>
          )}

          <p style={{ ...FF, textAlign: "center", fontSize: 12, color: C.textTertiary, margin: "18px 0 6px" }}>
            Réception 24h/24 — composez le 9 · Propulsé par Wegemo Hôtel
          </p>
        </div>
      </div>
    );
  }

  /* ---------- CHECK-IN (Booking/Airbnb-style wizard) ---------- */
  if (view === "checkin") {
    return <HotelCheckinWizard room={room} hotel={hotel} today={today} tomorrow={tomorrow} existing={checkin}
      onDone={(entry) => { setCheckin(entry); }} onBack={() => setView("home")} />;
  }

  /* ---------- CHECK-OUT EXPRESS ---------- */
  if (view === "checkout" && checkin) {
    return <HotelCheckoutFlow room={room} checkin={checkin} orders={orders}
      onDone={(updated) => { setCheckin(updated); }} onBack={() => setView("home")} />;
  }

  /* ---------- ROOM SERVICE ---------- */
  if (view === "room") {
    const cats = [...new Set(DEMO_HOTEL_MENU.map((m) => m.category))];
    return (
      <div style={{ minHeight: "100vh", background: C.bg }}>
        <div style={{ maxWidth: 560, margin: "0 auto", padding: 16, paddingBottom: cart.length ? 120 : 16 }}>
          {header("🍽️ Room service")}
          {orders.length > 0 && (
            <Surface style={{ padding: 14, marginBottom: 14 }}>
              {orders.map((o) => (
                <div key={o.id} style={{ ...FF, fontSize: 13, display: "flex", justifyContent: "space-between", gap: 8, padding: "4px 0" }}>
                  <span>{o.at} · {eur(o.total)} {o.method === "room" ? "· sur la note" : "· à la livraison"}</span>
                  <span style={{ color: C.accentBlue, fontWeight: 700 }}>{o.status}</span>
                </div>
              ))}
            </Surface>
          )}
          {cats.map((cat) => (
            <div key={cat} style={{ marginBottom: 18 }}>
              <h3 style={{ ...FF, fontSize: 15, fontWeight: 800, margin: "0 0 8px 4px", color: C.textSecondary }}>{cat}</h3>
              {DEMO_HOTEL_MENU.filter((m) => m.category === cat).map((m) => {
                const inCart = cart.find((c) => c.item.id === m.id);
                return (
                  <Surface key={m.id} style={{ padding: 14, marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 28 }}>{m.emoji}</span>
                    <div style={{ flex: 1 }}>
                      <strong style={{ ...FF, fontSize: 14 }}>{m.name}</strong>
                      <div style={{ ...FF, fontSize: 12, color: C.textSecondary }}>{m.description}</div>
                      <div style={{ ...FF, fontSize: 13, fontWeight: 800, marginTop: 2 }}>{eur(m.price)}</div>
                    </div>
                    {inCart ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <button onClick={() => decItem(m)} style={{ ...FF, width: 30, height: 30, borderRadius: 999, border: `1px solid ${C.borderStrong}`, background: C.surface, fontWeight: 800 }}>−</button>
                        <strong style={{ ...FF }}>{inCart.qty}</strong>
                        <button onClick={() => addItem(m)} style={{ ...FF, width: 30, height: 30, borderRadius: 999, border: "none", background: C.dark, color: C.white, fontWeight: 800 }}>+</button>
                      </div>
                    ) : (
                      <Btn variant="subtle" size="sm" onClick={() => addItem(m)}>+ Ajouter</Btn>
                    )}
                  </Surface>
                );
              })}
            </div>
          ))}
        </div>
        {cart.length > 0 && (
          <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, background: C.surface, borderTop: `1px solid ${C.border}`, padding: 14 }}>
            <div style={{ maxWidth: 560, margin: "0 auto" }}>
              <div style={{ ...FF, display: "flex", justifyContent: "space-between", fontWeight: 800, marginBottom: 10 }}>
                <span>{cart.reduce((s, c) => s + c.qty, 0)} article(s)</span><span>{eur(total)}</span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Btn variant="primary" size="md" style={{ flex: 1, opacity: checkin ? 1 : 0.45 }} onClick={() => (checkin ? placeOrder("room") : toast("Faites d'abord votre check-in pour la facturation chambre", "error"))}>
                  🛏️ Sur la note — Ch. {room}
                </Btn>
                <Btn variant="blue" size="md" style={{ flex: 1 }} onClick={() => placeOrder("card")}>💳 À la livraison</Btn>
              </div>
              {!checkin && <p style={{ ...FF, fontSize: 11.5, color: C.textTertiary, marginTop: 6, textAlign: "center" }}>« Sur la note » disponible après votre check-in en ligne ✅</p>}
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ---------- BREAKFAST (info + in-room with tray charge) ---------- */
  if (view === "breakfast") {
    return (
      <HotelBreakfast room={room} checkin={checkin} orders={orders}
        onOrder={(o) => setOrders((p) => [o, ...p])} onBack={() => setView("home")} />
    );
  }

  /* ---------- HOTEL SERVICES ---------- */
  if (view === "services") {
    return (
      <div style={{ minHeight: "100vh", background: C.bg }}>
        <div style={{ maxWidth: 560, margin: "0 auto", padding: 16 }}>
          {header("🧖 Services de l'hôtel")}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {HOTEL_SERVICES.map((s) => (
              <Surface key={s.id} style={{ padding: 16, display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 28 }}>{s.emoji}</div>
                <strong style={{ ...FF, fontSize: 14, marginTop: 6 }}>{s.name}</strong>
                <div style={{ ...FF, fontSize: 12, color: C.textSecondary, marginTop: 2, flex: 1 }}>{s.desc}</div>
                <div style={{ ...FF, fontSize: 13, fontWeight: 800, margin: "8px 0" }}>{s.price > 0 ? eur(s.price) : "Inclus"}</div>
                <Btn variant="subtle" size="sm" onClick={() => addRequest(`${s.emoji} ${s.name}`)}>{s.cta}</Btn>
              </Surface>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ---------- AROUND ---------- */
  if (view === "around") {
    return (
      <div style={{ minHeight: "100vh", background: C.bg }}>
        <div style={{ maxWidth: 560, margin: "0 auto", padding: 16 }}>
          {header("📍 Autour de vous")}
          <p style={{ ...FF, fontSize: 13, color: C.textSecondary, marginBottom: 14 }}>Sélection de la réception — événements et partenaires du quartier.</p>
          {HOTEL_EVENTS.map((ev) => (
            <Surface key={ev.id} style={{ padding: 16, marginBottom: 10 }}>
              <div style={{ display: "flex", gap: 12 }}>
                <span style={{ fontSize: 30 }}>{ev.emoji}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <strong style={{ ...FF, fontSize: 15 }}>{ev.title}</strong>
                    <Tag color={C.accentPurple}>{ev.tag}</Tag>
                  </div>
                  <div style={{ ...FF, fontSize: 12.5, color: C.textSecondary, marginTop: 2 }}>{ev.when} · {ev.dist}</div>
                  <p style={{ ...FF, fontSize: 13, marginTop: 6 }}>{ev.desc}</p>
                  <Btn variant="subtle" size="sm" style={{ marginTop: 8 }} onClick={() => addRequest(`${ev.emoji} Réservation « ${ev.title} »`)}>Réserver via la réception</Btn>
                </div>
              </div>
            </Surface>
          ))}
        </div>
      </div>
    );
  }

  /* ---------- INFO ---------- */
  if (view === "info") {
    return (
      <div style={{ minHeight: "100vh", background: C.bg }}>
        <div style={{ maxWidth: 560, margin: "0 auto", padding: 16 }}>
          {header("ℹ️ Infos pratiques")}
          {HOTEL_INFO.map((i) => (
            <Surface key={i.label} style={{ padding: 14, marginBottom: 8, display: "flex", gap: 12, alignItems: "center" }}>
              <span style={{ fontSize: 24 }}>{i.emoji}</span>
              <div>
                <strong style={{ ...FF, fontSize: 14 }}>{i.label}</strong>
                <div style={{ ...FF, fontSize: 13, color: C.textSecondary }}>{i.value}</div>
              </div>
            </Surface>
          ))}
        </div>
      </div>
    );
  }

  /* ---------- CONCIERGE ---------- */
  return (
    <div style={{ minHeight: "100vh", background: C.bg }}>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: 16 }}>
        {header("💬 Conciergerie")}
        <Surface style={{ padding: 16, marginBottom: 14 }}>
          <strong style={{ ...FF, fontSize: 14 }}>Demandes rapides</strong>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            {["🛁 Serviettes", "🛏️ Oreiller supplémentaire", "🧹 Ménage", "⏰ Réveil 7h", "🚕 Taxi pour 9h", "🍼 Lit bébé"].map((q) => (
              <button key={q} onClick={() => addRequest(q)} style={{ ...FF, padding: "9px 14px", borderRadius: 999, border: `1px solid ${C.borderStrong}`, background: C.surface, fontWeight: 600, fontSize: 13 }}>{q}</button>
            ))}
          </div>
        </Surface>
        <Surface style={{ padding: 16, marginBottom: 14 }}>
          <strong style={{ ...FF, fontSize: 14 }}>Message à la réception</strong>
          <textarea value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Ex : peut-on dîner tard ce soir ?" style={{ ...FF, width: "100%", minHeight: 80, padding: 12, borderRadius: 12, border: `1px solid ${C.borderStrong}`, outline: "none", marginTop: 10 }} />
          <Btn variant="primary" style={{ marginTop: 8 }} onClick={() => { if (msg.trim()) { addRequest(`✉️ « ${msg.trim()} »`); setMsg(""); } }}>Envoyer</Btn>
        </Surface>
        {requests.length > 0 && (
          <Surface style={{ padding: 16 }}>
            <strong style={{ ...FF, fontSize: 14 }}>Vos demandes</strong>
            {requests.map((r) => (
              <div key={r.id} style={{ ...FF, fontSize: 13, display: "flex", justifyContent: "space-between", gap: 8, marginTop: 8 }}>
                <span>{r.at} · {r.label}</span>
                <span style={{ color: C.accentGreen, fontWeight: 700, whiteSpace: "nowrap" }}>{r.status}</span>
              </div>
            ))}
          </Surface>
        )}
      </div>
    </div>
  );
}

/* Breakfast — buffet info + order a tray in the room (service charge). */
function HotelBreakfast({ room, checkin, orders, onOrder, onBack }) {
  const toast = useToast();
  const [formula, setFormula] = useState("continental");
  const [persons, setPersons] = useState(2);
  const [slot, setSlot] = useState("8h00 – 8h30");
  const [note, setNote] = useState("");
  const f = BREAKFAST_FORMULAS.find((x) => x.id === formula);
  const total = f.price * persons + TRAY_CHARGE;
  const scheduled = orders.filter((o) => o.breakfast);

  const order = () => {
    onOrder({
      id: uid(), breakfast: true, slot, note,
      items: [{ item: { id: `bf-${f.id}`, name: `Petit-déj ${f.name} en chambre`, price: f.price }, qty: persons }],
      total, method: checkin ? "room" : "card",
      status: `Programmé · ${slot} ⏰`,
      at: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
    });
    toast(`Petit-déjeuner programmé — livré entre ${slot}${checkin ? ` · sur la note Ch. ${room}` : " · payé à la livraison"}`, "success");
    onBack();
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg }}>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <Btn variant="subtle" size="sm" onClick={onBack}>←</Btn>
          <h2 style={{ ...FF, fontWeight: 800, fontSize: 19 }}>🥐 Petit-déjeuner</h2>
        </div>

        {scheduled.length > 0 && (
          <Surface style={{ padding: 14, marginBottom: 14, background: "#EAF7EE", border: `1px solid ${C.accentGreen}44` }}>
            {scheduled.map((o) => (
              <div key={o.id} style={{ ...FF, fontSize: 13, display: "flex", justifyContent: "space-between", gap: 8, padding: "3px 0" }}>
                <span>🥐 {o.items[0].qty}× {o.items[0].item.name} · {eur(o.total)}</span>
                <span style={{ color: C.accentGreen, fontWeight: 700, whiteSpace: "nowrap" }}>{o.status}</span>
              </div>
            ))}
          </Surface>
        )}

        {/* Buffet info */}
        <Surface style={{ padding: 18, marginBottom: 14 }}>
          <strong style={{ ...FF }}>🍽️ Au buffet — Salle Verrière (RDC)</strong>
          <div style={{ ...FF, fontSize: 13.5, color: C.textSecondary, marginTop: 8, lineHeight: 1.9 }}>
            Tous les jours de <b style={{ color: C.text }}>7h00 à 10h30</b> (dernier service 10h15)<br />
            Buffet à volonté : <b style={{ color: C.text }}>22€/pers.</b> · enfants -12 ans : <b style={{ color: C.text }}>11€</b> · -3 ans : offert<br />
            Viennoiseries, œufs minute, fruits frais, fromages, charcuterie, options sans gluten & vegan<br />
            Inclus si votre tarif comprend le petit-déjeuner — présentez votre n° de chambre
          </div>
        </Surface>

        {/* In-room */}
        <Surface style={{ padding: 18 }}>
          <strong style={{ ...FF }}>🛏️ En chambre — service {eur(TRAY_CHARGE)} / plateau</strong>
          <p style={{ ...FF, fontSize: 12.5, color: C.textSecondary, marginTop: 4 }}>Livré à la porte de la chambre {room} sur le créneau choisi. Commandez avant 22h la veille pour les créneaux avant 8h.</p>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            {BREAKFAST_FORMULAS.map((bf) => (
              <label key={bf.id} style={{ ...FF, display: "flex", gap: 12, alignItems: "flex-start", padding: 12, borderRadius: 14, border: `1.5px solid ${formula === bf.id ? C.accentOrange : C.border}`, background: formula === bf.id ? "#FFF6E5" : C.surface, cursor: "pointer" }}>
                <input type="radio" name="bf" checked={formula === bf.id} onChange={() => setFormula(bf.id)} style={{ marginTop: 4 }} />
                <span style={{ fontSize: 24 }}>{bf.emoji}</span>
                <span style={{ flex: 1 }}>
                  <b>{bf.name}</b> — {eur(bf.price)}/pers.<br />
                  <span style={{ fontSize: 12.5, color: C.textSecondary }}>{bf.desc}</span>
                </span>
              </label>
            ))}
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 14, alignItems: "flex-end" }}>
            <div>
              <label style={{ ...FF, display: "block", fontSize: 13, fontWeight: 600, color: C.textSecondary, marginBottom: 6 }}>Personnes</label>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button onClick={() => setPersons((p) => Math.max(1, p - 1))} style={{ ...FF, width: 34, height: 34, borderRadius: 999, border: `1px solid ${C.borderStrong}`, background: C.surface, fontWeight: 800 }}>−</button>
                <strong style={{ ...FF, fontSize: 16 }}>{persons}</strong>
                <button onClick={() => setPersons((p) => Math.min(6, p + 1))} style={{ ...FF, width: 34, height: 34, borderRadius: 999, border: "none", background: C.dark, color: C.white, fontWeight: 800 }}>+</button>
              </div>
            </div>
            <div style={{ flex: "1 1 170px" }}>
              <label style={{ ...FF, display: "block", fontSize: 13, fontWeight: 600, color: C.textSecondary, marginBottom: 6 }}>Créneau de livraison</label>
              <select value={slot} onChange={(e) => setSlot(e.target.value)} style={{ ...FF, width: "100%", padding: "12px 14px", borderRadius: 12, border: `1px solid ${C.borderStrong}`, background: C.surface }}>
                {BREAKFAST_SLOTS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <InputField label="Allergies / préférences (optionnel)" placeholder="Sans lactose, café déca…" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div style={{ ...FF, fontSize: 13.5, background: C.surfaceAlt, borderRadius: 12, padding: 12, marginBottom: 12 }}>
            {persons} × {f.name} ({eur(f.price)}) + service en chambre {eur(TRAY_CHARGE)} = <b style={{ fontSize: 15 }}>{eur(total)}</b>
          </div>

          <Btn variant="primary" size="lg" style={{ width: "100%", background: C.accentOrange }} onClick={order}>
            🥐 Commander pour la chambre {room} — {eur(total)}
          </Btn>
          <p style={{ ...FF, fontSize: 11.5, color: C.textTertiary, marginTop: 6, textAlign: "center" }}>
            {checkin ? `Facturé sur la note de la chambre ${room}` : "Réglé à la livraison (check-in non effectué)"}
          </p>
        </Surface>
      </div>
    </div>
  );
}

/* Express check-out — room bill review, departure schedule and instructions.
 * All figures are demo-fictional but internally consistent (nights × rate,
 * city tax, the room-service orders actually placed in this session). */
const DEMO_NIGHT_RATE = 145;      // fictional room rate for the demo
const DEMO_CITY_TAX = 3.3;        // fictional taxe de séjour / pers / nuit
function HotelCheckoutFlow({ room, checkin, orders, onDone, onBack }) {
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [late, setLate] = useState(false);
  const [luggage, setLuggage] = useState(false);
  const [invoiceEmail, setInvoiceEmail] = useState(checkin.email || "");
  const [rating, setRating] = useState(0);
  const [rated, setRated] = useState(false);

  // Fictional-but-consistent bill.
  const d1 = new Date(checkin.checkin_date || Date.now());
  const d2 = new Date(checkin.checkout_date || Date.now());
  const nights = Math.max(1, Math.round((d2 - d1) / 86400000));
  const guests = Number(checkin.guests) || 1;
  const roomServiceSession = orders.reduce((s, o) => s + o.total, 0);
  const lines = [
    { label: `Chambre ${room} · ${nights} nuit${nights > 1 ? "s" : ""} × ${eur(DEMO_NIGHT_RATE)}`, amount: nights * DEMO_NIGHT_RATE },
    { label: "Petit-déjeuner (2 pers. · hier)", amount: 44 },
    { label: "Minibar", amount: 8 },
    ...(roomServiceSession > 0 ? [{ label: "Room service & petit-déj en chambre (votre séjour)", amount: roomServiceSession }] : []),
    { label: `Taxe de séjour · ${guests} pers. × ${nights} nuit${nights > 1 ? "s" : ""}`, amount: Math.round(DEMO_CITY_TAX * guests * nights * 100) / 100 },
    ...(late ? [{ label: "Late check-out (jusqu'à 15h)", amount: 25 }] : []),
  ];
  const totalBill = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
  const deadline = late ? "15h00" : "12h00";

  const confirm = () => {
    const updated = { ...checkin, status: "departing", express_checkout: true, late_checkout: late, luggage_hold: luggage, invoice_email: invoiceEmail, bill_total: totalBill };
    writeGuestCheckins(readGuestCheckins().map((c) => (String(c.room) === String(room) ? updated : c)));
    onDone(updated);
    setStep(3);
    toast("Check-out enregistré — la réception est prévenue", "success");
  };

  const header = (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
      <Btn variant="subtle" size="sm" onClick={step === 2 ? () => setStep(1) : onBack}>←</Btn>
      <h2 style={{ ...FF, fontWeight: 800, fontSize: 19 }}>🧳 Check-out express — Chambre {room}</h2>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: C.bg }}>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: 16 }}>
        {header}

        {step === 1 && (
          <>
            <Surface style={{ padding: 18, marginBottom: 14 }}>
              <strong style={{ ...FF }}>🧾 Votre note de chambre</strong>
              <div style={{ marginTop: 12 }}>
                {lines.map((l) => (
                  <div key={l.label} style={{ ...FF, fontSize: 13.5, display: "flex", justifyContent: "space-between", gap: 10, padding: "5px 0" }}>
                    <span style={{ color: C.textSecondary }}>{l.label}</span>
                    <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{eur(l.amount)}</span>
                  </div>
                ))}
                <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 8, paddingTop: 10, display: "flex", justifyContent: "space-between", ...FF, fontWeight: 900, fontSize: 17 }}>
                  <span>Total</span><span>{eur(totalBill)}</span>
                </div>
              </div>
              <p style={{ ...FF, fontSize: 12, color: C.textTertiary, marginTop: 8 }}>Payé par la carte utilisée à la réservation. Une question sur la note ? Composez le 9.</p>
            </Surface>
            <Surface style={{ padding: 18, marginBottom: 14 }}>
              <strong style={{ ...FF }}>🕛 Horaires de départ</strong>
              <div style={{ ...FF, fontSize: 13.5, color: C.textSecondary, marginTop: 8, lineHeight: 1.8 }}>
                Chambre à libérer avant <b style={{ color: C.text }}>12h00</b> · late check-out possible jusqu'à <b style={{ color: C.text }}>15h00</b> (+25€, selon dispo)<br />
                Bagagerie gratuite jusqu'à <b style={{ color: C.text }}>18h00</b> · petit-déjeuner servi jusqu'à 10h30
              </div>
            </Surface>
            <Btn variant="primary" size="lg" style={{ width: "100%" }} onClick={() => setStep(2)}>Continuer →</Btn>
          </>
        )}

        {step === 2 && (
          <Surface style={{ padding: 18 }}>
            <strong style={{ ...FF }}>Options de départ</strong>
            <label style={{ ...FF, display: "flex", gap: 12, alignItems: "flex-start", padding: "14px 0", borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}>
              <input type="checkbox" checked={late} onChange={(e) => setLate(e.target.checked)} style={{ marginTop: 3 }} />
              <span><b>🕐 Late check-out jusqu'à 15h</b> — +25€<br /><span style={{ fontSize: 12.5, color: C.textSecondary }}>Confirmé immédiatement pour la démo (selon disponibilité en réel).</span></span>
            </label>
            <label style={{ ...FF, display: "flex", gap: 12, alignItems: "flex-start", padding: "14px 0", borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}>
              <input type="checkbox" checked={luggage} onChange={(e) => setLuggage(e.target.checked)} style={{ marginTop: 3 }} />
              <span><b>🧳 Bagagerie jusqu'à 18h</b> — gratuit<br /><span style={{ fontSize: 12.5, color: C.textSecondary }}>Déposez vos bagages à la réception après avoir libéré la chambre.</span></span>
            </label>
            <div style={{ marginTop: 14 }}>
              <InputField label="Facture par email" type="email" placeholder="votre@email.com" value={invoiceEmail} onChange={(e) => setInvoiceEmail(e.target.value)} />
            </div>
            <div style={{ ...FF, display: "flex", justifyContent: "space-between", fontWeight: 900, fontSize: 16, margin: "4px 0 14px" }}>
              <span>Total {late ? "(avec late check-out)" : ""}</span><span>{eur(totalBill)}</span>
            </div>
            <Btn variant="primary" size="lg" style={{ width: "100%", background: C.accentOrange }} onClick={confirm}>✅ Valider mon check-out</Btn>
          </Surface>
        )}

        {step === 3 && (
          <Surface style={{ padding: 26, textAlign: "center" }}>
            <div style={{ fontSize: 52 }}>👋</div>
            <h3 style={{ ...FF, fontSize: 22, fontWeight: 900, margin: "10px 0 4px" }}>Check-out enregistré !</h3>
            <p style={{ ...FF, fontSize: 14, color: C.textSecondary }}>La réception prépare votre départ, {checkin.guest_name.split(" ")[0]}.</p>
            <div style={{ background: C.surfaceAlt, borderRadius: 16, padding: 16, margin: "16px 0", textAlign: "left", ...FF, fontSize: 13.5, lineHeight: 2 }}>
              <div>🕛 Libérez la chambre avant <b>{deadline}</b></div>
              <div>🔑 Laissez les clés sur la porte ou déposez-les à la réception</div>
              {luggage && <div>🧳 Bagagerie réservée — jusqu'à 18h00</div>}
              {invoiceEmail && <div>🧾 Facture ({eur(totalBill)}) envoyée à <b>{invoiceEmail}</b></div>}
              <div>🚕 Besoin d'un taxi ? Conciergerie ou composez le 9</div>
            </div>
            {!rated ? (
              <>
                <p style={{ ...FF, fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Comment était votre séjour ?</p>
                <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 14 }}>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button key={s} onClick={() => { setRating(s); setRated(true); toast(s >= 4 ? "Merci ! ⭐ Votre avis compte énormément." : "Merci pour votre retour — la direction en est informée.", "success"); }}
                      style={{ fontSize: 30, background: "none", border: "none", cursor: "pointer", filter: s <= rating ? "none" : "grayscale(1) opacity(.45)" }}>⭐</button>
                  ))}
                </div>
              </>
            ) : (
              <p style={{ ...FF, fontSize: 14, color: C.accentGreen, fontWeight: 700, marginBottom: 14 }}>Merci pour votre note de {rating}/5 ⭐</p>
            )}
            <Btn variant="primary" size="lg" style={{ width: "100%" }} onClick={onBack}>Retour à l'accueil chambre</Btn>
          </Surface>
        )}
      </div>
    </div>
  );
}

/* Self check-in wizard — the flow guests know from Booking/Airbnb online
 * check-in: stay → identity → ID document → consent+signature → access code. */
function HotelCheckinWizard({ room, hotel, today, tomorrow, existing, onDone, onBack }) {
  const toast = useToast();
  const [step, setStep] = useState(existing ? 5 : 1);
  const [form, setForm] = useState({
    checkin_date: today, checkout_date: tomorrow, arrival_time: "15h - 17h", guests: 2,
    guest_name: "", email: "", phone: "", nationality: "Française", birthdate: "",
    id_type: ID_TYPES[0], id_number: "", id_file: null,
    notes: "", consent: false, signature: "",
  });
  const [entry, setEntry] = useState(existing);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const submit = () => {
    const e = {
      id: uid(), restaurant_id: "demo-hotel", guest_name: form.guest_name.trim(), email: form.email,
      phone: form.phone, room: Number(room), guests: Number(form.guests) || 1,
      checkin_date: form.checkin_date, checkout_date: form.checkout_date, arrival_time: form.arrival_time,
      nationality: form.nationality, birthdate: form.birthdate,
      id_type: form.id_type, id_number: form.id_number, id_provided: !!form.id_file,
      notes: form.notes, status: "arriving",
      access_code: `WGM-${room}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    };
    const list = readGuestCheckins().filter((c) => String(c.room) !== String(room));
    writeGuestCheckins([...list, e]);
    setEntry(e);
    onDone(e);
    setStep(5);
    toast("Check-in enregistré !", "success");
  };

  const bar = (
    <div style={{ display: "flex", gap: 5, margin: "0 0 18px" }}>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} style={{ flex: 1, height: 5, borderRadius: 99, background: i <= Math.min(step, 4) ? C.accentBlue : C.border }} />
      ))}
    </div>
  );
  const next = (cond, msgTxt) => () => (cond ? setStep((s) => s + 1) : toast(msgTxt, "error"));
  const selectStyle = { ...FF, width: "100%", padding: "12px 14px", borderRadius: 12, border: `1px solid ${C.borderStrong}`, background: C.surface };

  return (
    <div style={{ minHeight: "100vh", background: C.bg }}>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <Btn variant="subtle" size="sm" onClick={step > 1 && step < 5 ? () => setStep((s) => s - 1) : onBack}>←</Btn>
          <h2 style={{ ...FF, fontWeight: 800, fontSize: 19 }}>🛎️ Check-in en ligne — Chambre {room}</h2>
        </div>
        {step < 5 && bar}

        {step === 1 && (
          <Surface style={{ padding: 18 }}>
            <strong style={{ ...FF }}>1 · Votre séjour</strong>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
              <div style={{ flex: "1 1 140px" }}><InputField label="Arrivée" type="date" value={form.checkin_date} onChange={(e) => set("checkin_date", e.target.value)} /></div>
              <div style={{ flex: "1 1 140px" }}><InputField label="Départ" type="date" value={form.checkout_date} onChange={(e) => set("checkout_date", e.target.value)} /></div>
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 160px" }}>
                <label style={{ ...FF, display: "block", fontSize: 13, fontWeight: 600, color: C.textSecondary, marginBottom: 6 }}>Heure d'arrivée estimée</label>
                <select value={form.arrival_time} onChange={(e) => set("arrival_time", e.target.value)} style={selectStyle}>
                  {["Avant 15h", "15h - 17h", "17h - 19h", "19h - 22h", "Après 22h"].map((h) => <option key={h}>{h}</option>)}
                </select>
              </div>
              <div style={{ flex: "1 1 110px" }}><InputField label="Voyageurs" type="number" min={1} value={form.guests} onChange={(e) => set("guests", e.target.value)} /></div>
            </div>
            <Btn variant="primary" size="lg" style={{ width: "100%" }} onClick={next(form.checkin_date && form.checkout_date, "Dates requises")}>Continuer</Btn>
          </Surface>
        )}

        {step === 2 && (
          <Surface style={{ padding: 18 }}>
            <strong style={{ ...FF }}>2 · Vos coordonnées</strong>
            <div style={{ marginTop: 12 }}>
              <InputField label="Nom complet (titulaire de la réservation)" placeholder="Léa Martin" value={form.guest_name} onChange={(e) => set("guest_name", e.target.value)} />
              <InputField label="Email" type="email" placeholder="lea@exemple.com" value={form.email} onChange={(e) => set("email", e.target.value)} />
              <InputField label="Téléphone" type="tel" placeholder="+33 6 12 34 56 78" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 150px" }}><InputField label="Nationalité" value={form.nationality} onChange={(e) => set("nationality", e.target.value)} /></div>
                <div style={{ flex: "1 1 150px" }}><InputField label="Date de naissance" type="date" value={form.birthdate} onChange={(e) => set("birthdate", e.target.value)} /></div>
              </div>
            </div>
            <Btn variant="primary" size="lg" style={{ width: "100%" }} onClick={next(form.guest_name.trim() && form.email, "Nom et email requis")}>Continuer</Btn>
          </Surface>
        )}

        {step === 3 && (
          <Surface style={{ padding: 18 }}>
            <strong style={{ ...FF }}>3 · Pièce d'identité</strong>
            <p style={{ ...FF, fontSize: 12.5, color: C.textSecondary, marginTop: 6 }}>Obligatoire pour la fiche de police (comme sur Booking.com / Airbnb). Vos données restent chez l'hôtelier.</p>
            <div style={{ marginTop: 12 }}>
              <label style={{ ...FF, display: "block", fontSize: 13, fontWeight: 600, color: C.textSecondary, marginBottom: 6 }}>Type de document</label>
              <select value={form.id_type} onChange={(e) => set("id_type", e.target.value)} style={{ ...selectStyle, marginBottom: 14 }}>
                {ID_TYPES.map((t2) => <option key={t2}>{t2}</option>)}
              </select>
              <InputField label="Numéro du document" placeholder="ex : 123456789012" value={form.id_number} onChange={(e) => set("id_number", e.target.value)} />
              <label style={{ ...FF, display: "block", fontSize: 13, fontWeight: 600, color: C.textSecondary, marginBottom: 6 }}>Photo du document</label>
              <label style={{ ...FF, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, border: `2px dashed ${form.id_file ? C.accentGreen : C.borderStrong}`, borderRadius: 14, padding: 22, cursor: "pointer", background: form.id_file ? "#EAF7EE" : C.surfaceAlt }}>
                <span style={{ fontSize: 28 }}>{form.id_file ? "✅" : "📷"}</span>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{form.id_file ? form.id_file.name : "Prendre en photo ou importer"}</span>
                <span style={{ fontSize: 11.5, color: C.textTertiary }}>JPG, PNG ou PDF — recto suffisant</span>
                <input type="file" accept="image/*,.pdf" capture="environment" style={{ display: "none" }} onChange={(e) => set("id_file", e.target.files?.[0] || null)} />
              </label>
            </div>
            <Btn variant="primary" size="lg" style={{ width: "100%", marginTop: 16 }} onClick={next(form.id_number.trim(), "Numéro de document requis")}>Continuer</Btn>
          </Surface>
        )}

        {step === 4 && (
          <Surface style={{ padding: 18 }}>
            <strong style={{ ...FF }}>4 · Récapitulatif & signature</strong>
            <div style={{ background: C.surfaceAlt, borderRadius: 14, padding: 14, margin: "12px 0", ...FF, fontSize: 13.5, lineHeight: 1.8 }}>
              <div><b>{form.guest_name}</b> · {form.guests} voyageur(s) · Chambre {room}</div>
              <div>{form.checkin_date} → {form.checkout_date} · arrivée {form.arrival_time}</div>
              <div>{form.id_type} n° {form.id_number} {form.id_file ? "· document fourni ✅" : "· document à présenter à l'accueil"}</div>
            </div>
            <InputField label="Demandes particulières (optionnel)" placeholder="Étage calme, lit bébé…" value={form.notes} onChange={(e) => set("notes", e.target.value)} />
            <label style={{ ...FF, fontSize: 13, display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 14 }}>
              <input type="checkbox" checked={form.consent} onChange={(e) => set("consent", e.target.checked)} style={{ marginTop: 3 }} />
              <span>J'accepte le règlement intérieur de l'hôtel et certifie l'exactitude des informations fournies.</span>
            </label>
            <InputField label="Signature (tapez votre nom complet)" placeholder={form.guest_name || "Votre nom"} value={form.signature} onChange={(e) => set("signature", e.target.value)} />
            <Btn variant="primary" size="lg" style={{ width: "100%", background: C.accentGreen }} onClick={() => (form.consent && form.signature.trim() ? submit() : toast("Consentement et signature requis", "error"))}>
              ✅ Valider mon check-in
            </Btn>
          </Surface>
        )}

        {step === 5 && entry && (
          <Surface style={{ padding: 26, textAlign: "center" }}>
            <div style={{ fontSize: 52 }}>🎉</div>
            <h3 style={{ ...FF, fontSize: 22, fontWeight: 900, margin: "10px 0 4px" }}>Check-in enregistré !</h3>
            <p style={{ ...FF, fontSize: 14, color: C.textSecondary }}>La réception est prévenue de votre arrivée, {entry.guest_name.split(" ")[0]}.</p>
            <div style={{ background: C.dark, color: C.white, borderRadius: 16, padding: 18, margin: "18px 0", ...FF }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Votre code d'accès</div>
              <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: 2 }}>{entry.access_code}</div>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>À présenter à la réception pour récupérer votre clé</div>
            </div>
            <div style={{ ...FF, fontSize: 13.5, color: C.textSecondary, lineHeight: 1.8 }}>
              Chambre {entry.room} · {entry.checkin_date} → {entry.checkout_date}<br />
              {entry.guests} voyageur(s) · arrivée {entry.arrival_time || "—"}
            </div>
            <Btn variant="primary" size="lg" style={{ width: "100%", marginTop: 18 }} onClick={onBack}>Découvrir ma chambre →</Btn>
          </Surface>
        )}
      </div>
    </div>
  );
}

/* ============================================================================
 * CUSTOMER PAGE (state machine)
 * ==========================================================================*/
function LangPicker({ lang, setLang, dark }) {
  const [open, setOpen] = useState(false);
  const current = CUSTOMER_LANGS.find((l) => l.code === lang) || CUSTOMER_LANGS[0];
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen((v) => !v)} style={{ ...FF, padding: "8px 12px", borderRadius: 999, border: `1px solid ${C.border}`, background: dark ? "rgba(255,255,255,.9)" : C.surface, fontWeight: 600, fontSize: 14 }}>
        {current.flag} {current.code.toUpperCase()} ▾
      </button>
      {open && (
        <div style={{ position: "absolute", top: "110%", right: 0, background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: "0 8px 24px rgba(0,0,0,.15)", zIndex: 50, overflow: "hidden" }}>
          {CUSTOMER_LANGS.map((l) => (
            <button key={l.code} onClick={() => { setLang(l.code); setOpen(false); }} style={{ ...FF, display: "block", width: "100%", padding: "10px 16px", textAlign: "left", fontSize: 14, fontWeight: 500, whiteSpace: "nowrap", background: lang === l.code ? C.surfaceAlt : "transparent" }}>
              {l.flag} {l.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CustomerPage({ slug, tableNum }) {
  const [step, setStep] = useState("loading");
  const [restaurant, setRestaurant] = useState(null);
  const [menu, setMenu] = useState([]);
  const [settings, setSettings] = useState({});
  const [tableId, setTableId] = useState(null);
  const [tableLabel, setTableLabel] = useState(null);
  const [lang, setLang] = useState("fr");
  const [orderType, setOrderType] = useState("dine_in");
  const [cart, setCart] = useState([]);
  const [promo, setPromo] = useState(null);
  const [profile, setProfile] = useState({ name: "", email: "" });
  const [orderId, setOrderId] = useState(null);
  const [composing, setComposing] = useState(null);

  useEffect(() => {
    (async () => {
      // Demo / offline
      // Baoma sans Supabase = aperçu hors ligne ; dès que Supabase est
      // configuré on passe par la vraie carte pour que les commandes partent
      // en base et remontent en cuisine.
      if (slug === "demo" || slug === "demo-hotel" || !hasSupabase) {
        const hotel = slug === "demo-hotel";
        const baoma = slug === BAOMA_SLUG;
        setRestaurant(baoma ? BAOMA_RESTAURANT : hotel ? DEMO_HOTEL : DEMO_RESTAURANT);
        setMenu(baoma ? BAOMA_MENU : hotel ? DEMO_HOTEL_MENU : DEMO_MENU);
        setTableId("t" + tableNum);
        setStep("ordertype");
        return;
      }
      const byUuid = /^[0-9a-f-]{36}$/i.test(slug);
      const { data: r } = await supabase.from("restaurants").select("*").eq(byUuid ? "id" : "slug", slug).maybeSingle();
      if (!r) {
        setStep("error");
        return;
      }
      setRestaurant(r);
      const [{ data: m }, { data: tb }, { data: st }] = await Promise.all([
        supabase.from("menu_items").select("*").eq("restaurant_id", r.id).eq("available", true),
        supabase.from("tables").select("*").eq("restaurant_id", r.id).eq("number", Number(tableNum)).maybeSingle(),
        supabase.from("restaurant_settings").select("*").eq("restaurant_id", r.id).maybeSingle(),
      ]);
      setMenu(m || []);
      setTableId(tb?.id || null);
      setTableLabel(tb?.label || null);
      setSettings(st || {});
      setStep("ordertype");
    })();
  }, [slug, tableNum]);

  const subtotal = cart.reduce((s, c) => s + c.lineTotal, 0);
  const discount = promo ? (promo.discount_percent ? subtotal * (promo.discount_percent / 100) : Math.min(promo.discount_amount || 0, subtotal)) : 0;
  const total = Math.max(0, subtotal - discount);

  const addToCart = (item, supplements = [], qty = 1) => {
    const supTotal = supplements.reduce((s, x) => s + Number(x.price || 0), 0);
    const lineTotal = (Number(item.price) + supTotal) * qty;
    setCart((p) => [...p, { key: uid(), item, supplements, qty, lineTotal }]);
  };

  if (step === "loading") return <CenterMsg emoji="⏳" text="Chargement…" />;
  if (step === "error") return <CenterMsg emoji="🤷" text="Restaurant introuvable." />;

  const dir = lang === "ar" ? "rtl" : "ltr";

  return (
    <div dir={dir} style={{ minHeight: "100vh", background: BAOMA_THEME_SLUGS.includes(restaurant.slug) ? BAOMA_THEME.offwhite : C.bg, maxWidth: 480, margin: "0 auto", position: "relative" }}>
      {step === "ordertype" && (
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 30 }}>
            <span style={{ fontSize: 32 }}>{restaurant.logo_emoji}</span>
            <LangPicker lang={lang} setLang={setLang} />
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <h1 style={{ ...FF, fontSize: 26, fontWeight: 900, textAlign: "center", marginBottom: 4 }}>{restaurant.name}</h1>
            <p style={{ ...FF, textAlign: "center", color: C.textSecondary, marginBottom: 28 }}>{t(lang, "orderTypeTitle")}</p>
            {[["dine_in", "dineIn", "dineInSub", "🍽️"], ["takeaway", "takeaway", "takeawaySub", "🥡"]].map(([val, k, sub, em]) => (
              <button key={val} onClick={() => setOrderType(val)} style={{ ...FF, display: "flex", alignItems: "center", gap: 14, padding: 18, marginBottom: 12, borderRadius: 16, border: `2px solid ${orderType === val ? C.accent : C.border}`, background: orderType === val ? `${C.accent}0D` : C.surface, textAlign: "left", width: "100%" }}>
                <span style={{ fontSize: 30 }}>{em}</span>
                <div>
                  <strong style={{ ...FF, fontSize: 17 }}>{t(lang, k)}</strong>
                  <div style={{ ...FF, fontSize: 13, color: C.textSecondary }}>{t(lang, sub)}</div>
                </div>
              </button>
            ))}
            <Btn variant="primary" size="lg" style={{ marginTop: 16 }} onClick={() => setStep("menu")}>{t(lang, "orderTypeConfirm")}</Btn>
          </div>
        </div>
      )}

      {step === "menu" && (
        BAOMA_THEME_SLUGS.includes(restaurant.slug) ? (
          <BaomaMenu restaurant={restaurant} menu={menu} lang={lang} setLang={setLang} cart={cart} onCompose={(it) => setComposing(it)} onAdd={addToCart} onCart={() => setStep("cart")} tableLabel={tableLabel} tableNum={tableNum} />
        ) : (
          <CustomerMenu restaurant={restaurant} menu={menu} settings={settings} lang={lang} setLang={setLang} cart={cart} onCompose={(it) => setComposing(it)} onAdd={addToCart} onCart={() => setStep("cart")} tableLabel={tableLabel} tableNum={tableNum} />
        )
      )}

      {step === "cart" && (
        <CustomerCart cart={cart} setCart={setCart} lang={lang} subtotal={subtotal} discount={discount} total={total} promo={promo} setPromo={setPromo} restaurant={restaurant} onBack={() => setStep("menu")} onNext={() => setStep("profile")} />
      )}

      {step === "profile" && (
        <div style={{ padding: 24, minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <h2 style={{ ...FF, fontWeight: 800, marginBottom: 16 }}>{t(lang, "yourName")}</h2>
          <InputField label={t(lang, "yourName")} value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
          <InputField label={t(lang, "yourEmail")} type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} />
          <Btn variant="primary" size="lg" onClick={() => setStep("payment")}>{t(lang, "confirm")}</Btn>
          <button onClick={() => setStep("payment")} style={{ ...FF, marginTop: 12, color: C.textSecondary, fontSize: 14 }}>{t(lang, "skip")}</button>
        </div>
      )}

      {step === "payment" && (
        <CustomerPayment restaurant={restaurant} tableId={tableId} orderType={orderType} cart={cart} total={total} promo={promo} profile={profile} lang={lang} onBack={() => setStep("cart")} onDone={(id) => { setOrderId(id); setStep("done"); }} />
      )}

      {step === "done" && (
        <CustomerDone orderId={orderId} restaurant={restaurant} settings={settings} lang={lang} />
      )}

      {composing && (
        <ComposeModal item={composing} lang={lang} onClose={() => setComposing(null)} onAdd={addToCart} />
      )}
    </div>
  );
}

function CenterMsg({ emoji, text }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
      <div style={{ fontSize: 50 }}>{emoji}</div>
      <p style={{ ...FF, color: C.textSecondary }}>{text}</p>
    </div>
  );
}

// Public base URL of the deployed app (handles GitHub Pages subpaths).
const siteBase = () => `${window.location.origin}${(import.meta.env.VITE_BASE_PATH || "/").replace(/\/+$/, "")}`;

// Trackable short link: /go/{slug} → logs a click then sends the guest to the
// restaurant's ordering page with the promo code pre-applied.
function GoRedirect({ slug }) {
  useEffect(() => {
    const home = `${siteBase()}/`;
    if (!hasSupabase) { window.location.replace(home); return; }
    supabase.rpc("track_click", { p_slug: slug }).then(({ data }) => {
      const row = Array.isArray(data) ? data[0] : data;
      if (row?.restaurant_slug) {
        const q = row.promo_code ? `?promo=${encodeURIComponent(row.promo_code)}` : "";
        window.location.replace(`${siteBase()}/r/${row.restaurant_slug}/t/0${q}`);
      } else window.location.replace(home);
    }).catch(() => window.location.replace(home));
  }, [slug]);
  return <CenterMsg emoji="🔗" text="Redirection…" />;
}

function CustomerMenu({ restaurant, menu, settings, lang, setLang, cart, onCompose, onAdd, onCart, tableLabel, tableNum }) {
  const [cat, setCat] = useState("ALL");
  const [search, setSearch] = useState("");
  const cats = ["ALL", ...new Set(menu.map((m) => m.category))];
  const filtered = menu.filter((m) => (cat === "ALL" || m.category === cat) && m.name.toLowerCase().includes(search.toLowerCase()));
  const headerBg = settings.menu_header_bg_url;

  return (
    <div style={{ paddingBottom: cart.length ? 80 : 20 }}>
      <div style={{ padding: 20, background: headerBg ? `url(${headerBg}) center/cover` : C.surface, color: headerBg ? C.white : C.text }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <strong style={{ ...FF, fontSize: 20 }}>{restaurant.logo_emoji} {restaurant.name}</strong>
            <div style={{ ...FF, fontSize: 13, opacity: 0.8 }}>{tableLabel || `Table ${tableNum}`}</div>
          </div>
          <LangPicker lang={lang} setLang={setLang} dark={!!headerBg} />
        </div>
      </div>
      <div style={{ padding: "12px 16px", position: "sticky", top: 0, background: C.bg, zIndex: 10 }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t(lang, "search")} style={{ ...FF, width: "100%", padding: "10px 14px", borderRadius: 12, border: `1px solid ${C.border}`, outline: "none", marginBottom: 8 }} />
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
          {cats.map((c) => (
            <button key={c} onClick={() => setCat(c)} style={{ ...FF, padding: "7px 14px", borderRadius: 999, fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", border: `1px solid ${cat === c ? C.text : C.border}`, background: cat === c ? C.text : C.surface, color: cat === c ? C.white : C.text }}>
              {c === "ALL" ? t(lang, "all") : c}
            </button>
          ))}
        </div>
      </div>
      <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.map((m) => {
          const out = m.stock != null && Number(m.stock) <= 0;
          return (
            <Surface key={m.id} style={{ padding: 14, display: "flex", gap: 12, alignItems: "center", opacity: out ? 0.5 : 1 }}>
              <div style={{ fontSize: 34 }}>{m.emoji}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <strong style={{ ...FF }}>{m.name}</strong>
                  {m.is_popular && <Tag color={C.accent}>★ {t(lang, "popular")}</Tag>}
                </div>
                <p style={{ ...FF, fontSize: 12, color: C.textSecondary }}>{m.description}</p>
                <strong style={{ ...FF, color: C.accentGreen }}>{eur(m.price)}</strong>
              </div>
              <Btn variant="primary" size="sm" disabled={out} onClick={() => ((m.supplements?.length || m.extras?.length) ? onCompose(m) : onAdd(m))}>
                {out ? "—" : "+"}
              </Btn>
            </Surface>
          );
        })}
      </div>
      {cart.length > 0 && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, maxWidth: 480, margin: "0 auto", padding: 14 }}>
          <Btn variant="primary" size="lg" style={{ width: "100%" }} onClick={onCart}>
            🛒 {t(lang, "cart")} ({cart.length}) — {eur(cart.reduce((s, c) => s + c.lineTotal, 0))}
          </Btn>
        </div>
      )}
    </div>
  );
}
/* ============================================================================
 * THÈME BAOMA — rendu client dédié pour /r/baoma/t/{n}
 *
 * Reprend le design du site vitrine Baoma (grille 2 colonnes, tilt 3D au
 * survol/appui, halo orange, Ken Burns, frise de catégories qui suit le
 * scroll) tout en branchant les vrais menu_items et le vrai panier Wegemo.
 * Activé uniquement quand restaurant.slug === "baoma" : tous les autres
 * restaurants continuent d'utiliser <CustomerMenu /> sans changement.
 * ==========================================================================*/
const BK = BAOMA_THEME;
const BFF = { fontFamily: "'Figtree', -apple-system, BlinkMacSystemFont, sans-serif" };
const BDISPLAY = { fontFamily: BK.display, fontWeight: 400, textTransform: "uppercase" };
const KB_DIRS = ["tl", "tr", "bl", "br"];

// Le chemin des photos est relatif à la racine servie : on préfixe par la
// base Vite pour rester correct sous un sous-chemin (GitHub Pages).
const bImg = (u) => (u && u.startsWith("/") ? `${(import.meta.env.BASE_URL || "/").replace(/\/+$/, "")}${u}` : u);

// Décale la dérive de chaque photo à partir de son nom, pour éviter que
// toutes les cartes respirent exactement en même temps.
function kbTiming(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 997;
  return { delay: -((h % 9) * 0.9), duration: 8 + (h % 5), dir: KB_DIRS[h % 4] };
}

// Tilt 3D piloté au pointeur, unifié souris + tactile : l'appui incline la
// carte depuis le point touché, le relâchement la laisse revenir après un
// court délai (sinon l'effet serait invisible sur mobile).
function useBaomaTilt(strength = 8) {
  const ref = useRef(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, px: 0, py: 0 });
  const [on, setOn] = useState(false);
  const timer = useRef(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const from = (clientX, clientY) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (clientX - r.left) / r.width - 0.5;
    const py = (clientY - r.top) / r.height - 0.5;
    setTilt({ rx: -py * strength, ry: px * strength, px, py });
    setOn(true);
  };
  const release = () => { setTilt({ rx: 0, ry: 0, px: 0, py: 0 }); setOn(false); };

  return {
    ref, tilt, on,
    handlers: {
      onPointerMove: (e) => { clearTimeout(timer.current); from(e.clientX, e.clientY); },
      onPointerDown: (e) => { clearTimeout(timer.current); from(e.clientX, e.clientY); },
      onPointerLeave: (e) => { if (e.pointerType !== "mouse") return; clearTimeout(timer.current); release(); },
      onPointerUp: (e) => { if (e.pointerType === "mouse") return; clearTimeout(timer.current); timer.current = setTimeout(release, 600); },
      onPointerCancel: () => { clearTimeout(timer.current); release(); },
    },
  };
}

// Révèle les éléments .baoma-reveal à leur entrée dans le viewport.
function useBaomaReveal(rootRef, deps = []) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const items = Array.from(root.querySelectorAll(".baoma-reveal"));
    if (!items.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.add("baoma-reveal-in");
          io.unobserve(e.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    items.forEach((i) => io.observe(i));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

function BaomaCard({ item, onPick }) {
  const { ref, tilt, on, handlers } = useBaomaTilt(8);
  const [failed, setFailed] = useState(false);
  const kb = kbTiming(item.id || item.name);
  const out = item.stock != null && Number(item.stock) <= 0;
  const photo = bImg(item.photo_url);

  return (
    <div
      ref={ref}
      {...handlers}
      onClick={() => !out && onPick(item)}
      className="baoma-reveal"
      style={{
        position: "relative", overflow: "hidden", borderRadius: 16,
        background: BK.charcoal, cursor: out ? "default" : "pointer",
        opacity: out ? 0.45 : 1,
        transformStyle: "preserve-3d", perspective: 900,
        transform: `perspective(900px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg) translateY(${on ? -8 : 0}px)`,
        boxShadow: on ? "0 0 40px -5px rgba(255,90,31,0.35)" : "none",
        outline: `1px solid ${on ? "rgba(255,90,31,0.6)" : "rgba(10,10,10,0.06)"}`,
        outlineOffset: -1,
        transition: "transform .35s cubic-bezier(.16,1,.3,1), box-shadow .3s ease, outline-color .3s ease",
      }}
    >
      <div style={{ position: "relative", aspectRatio: "1 / 1", overflow: "hidden" }}>
        {photo && !failed ? (
          <div
            style={{
              position: "absolute", inset: 0,
              transform: `translate(${tilt.px * -4}%, ${tilt.py * -4}%)`,
              transition: "transform .4s cubic-bezier(.16,1,.3,1)",
            }}
          >
            <img
              src={photo}
              alt={item.name}
              loading="lazy"
              onError={() => setFailed(true)}
              className={`baoma-kb${on ? " baoma-kb-paused" : ""}`}
              style={{
                width: "100%", height: "100%", objectFit: "cover", display: "block",
                animationName: `baoma-kb-${kb.dir}`,
                animationDelay: `${kb.delay}s`,
                animationDuration: `${kb.duration}s`,
              }}
            />
          </div>
        ) : (
          <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", fontSize: 40, background: `linear-gradient(135deg, ${BK.charcoal}, rgba(255,90,31,0.18))` }}>
            {item.emoji || "🍽️"}
          </div>
        )}

        {/* balayage lumineux au survol / à l'appui */}
        <div
          style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            transform: `skewX(-12deg) translateX(${on ? 130 : -130}%)`,
            background: "linear-gradient(90deg, transparent, rgba(245,245,240,0.4), transparent)",
            transition: "transform .7s ease-out",
          }}
        />

        {item.is_popular && (
          <span style={{ ...BFF, position: "absolute", top: 8, left: 8, background: BK.orange, color: BK.ink, fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 999, letterSpacing: 0.4 }}>
            ★ POPULAIRE
          </span>
        )}

        {/* bouton d'ajout, repris de la maquette client */}
        <span
          aria-hidden
          style={{
            position: "absolute", right: 8, bottom: 8, width: 34, height: 34,
            borderRadius: 12, background: out ? "rgba(10,10,10,.35)" : BK.orange,
            color: "#fff", display: "grid", placeItems: "center",
            fontSize: 20, fontWeight: 700, lineHeight: 1,
            boxShadow: "0 2px 10px rgba(0,0,0,.2)",
          }}
        >
          {out ? "–" : "+"}
        </span>
      </div>

      <div style={{ padding: "10px 12px 12px" }}>
        <h3 style={{ ...BDISPLAY, fontSize: 13, lineHeight: 1.15, letterSpacing: 0.3, color: BK.ink }}>{item.name}</h3>
        {item.description && (
          <p style={{ ...BFF, fontSize: 11, lineHeight: 1.3, color: "rgba(10,10,10,.62)", marginTop: 3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {item.description}
          </p>
        )}
        <strong style={{ ...BFF, display: "block", marginTop: 5, fontSize: 13, fontWeight: 800, color: on ? BK.orange : BK.ink, transition: "color .3s ease" }}>
          {eur(item.price)}
        </strong>
      </div>
    </div>
  );
}

function BaomaMenu({ restaurant, menu, lang, setLang, cart, onCompose, onAdd, onCart, tableLabel, tableNum }) {
  const rootRef = useRef(null);
  const stripRef = useRef(null);
  const [active, setActive] = useState(null);

  // Catégories dans l'ordre Baoma, limitées à celles qui ont des plats.
  const known = BAOMA_CATEGORIES.filter((c) => menu.some((m) => m.category === c.name));
  const extra = [...new Set(menu.map((m) => m.category))]
    .filter((n) => !BAOMA_CATEGORIES.some((c) => c.name === n))
    .map((n) => ({ name: n, tagline: "" }));
  const groups = [...known, ...extra].map((c) => ({
    ...c,
    key: slugify(c.name),
    items: menu
      .filter((m) => m.category === c.name)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
  }));

  useBaomaReveal(rootRef, [menu.length]);

  // Tant que le scroll n'a rien signalé, la première catégorie est active.
  const activeKey = active ?? groups[0]?.key;

  // Frise : suit la catégorie qui passe sous l'en-tête collant.
  useEffect(() => {
    const els = groups
      .map((g) => document.getElementById(`bcat-${g.key}`))
      .filter(Boolean);
    if (!els.length) return;
    const order = groups.map((g) => g.key);
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting);
        if (!vis.length) return;
        const deepest = vis.reduce((a, b) =>
          order.indexOf(a.target.id.replace("bcat-", "")) > order.indexOf(b.target.id.replace("bcat-", "")) ? a : b,
        );
        setActive(deepest.target.id.replace("bcat-", ""));
      },
      { rootMargin: "-140px 0px -72% 0px", threshold: 0 },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu.length]);

  // Recentre la pastille active dans la frise (scrollLeft manuel : un
  // scrollIntoView ferait aussi défiler la page verticalement).
  useEffect(() => {
    const strip = stripRef.current;
    const pill = strip?.querySelector(`[data-bpill="${activeKey}"]`);
    if (!strip || !pill) return;
    strip.scrollTo({ left: pill.offsetLeft - strip.clientWidth / 2 + pill.offsetWidth / 2, behavior: "smooth" });
  }, [activeKey]);

  const goto = (key) => {
    setActive(key);
    document.getElementById(`bcat-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const pick = (item) => ((item.supplements?.length || item.extras?.length) ? onCompose(item) : onAdd(item));
  const count = cart.reduce((s, c) => s + (c.qty || 1), 0);

  return (
    <div ref={rootRef} style={{ background: BK.offwhite, minHeight: "100vh", paddingBottom: cart.length ? 92 : 24 }}>
      {/* En-tête */}
      <div style={{ background: BK.offwhite, padding: "16px 16px 10px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(10,10,10,.07)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img
            src={bImg("/logo-baoma.png")}
            alt="Baoma"
            style={{ height: 34, width: "auto", display: "block" }}
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
          <div>
            <div style={{ ...BDISPLAY, fontSize: 17, letterSpacing: 0.5, color: BK.ink, lineHeight: 1 }}>{restaurant.name}</div>
            <div style={{ ...BFF, fontSize: 11, color: "rgba(10,10,10,.55)", marginTop: 2 }}>{tableLabel || `Table ${tableNum}`}</div>
          </div>
        </div>
        <LangPicker lang={lang} setLang={setLang} />
      </div>

      {/* Frise de catégories collante */}
      <div style={{ position: "sticky", top: 0, zIndex: 20, background: "rgba(245,245,240,.94)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", borderBottom: "1px solid rgba(10,10,10,.06)" }}>
        <div
          ref={stripRef}
          style={{ display: "flex", gap: 8, overflowX: "auto", padding: "10px 16px", scrollbarWidth: "none" }}
        >
          {groups.map((g) => (
            <button
              key={g.key}
              data-bpill={g.key}
              onClick={() => goto(g.key)}
              style={{
                ...BFF, flexShrink: 0, whiteSpace: "nowrap", borderRadius: 999,
                padding: "7px 15px", fontSize: 11, fontWeight: 800,
                textTransform: "uppercase", letterSpacing: 0.6,
                background: activeKey === g.key ? BK.orange : "rgba(10,10,10,.05)",
                color: activeKey === g.key ? BK.ink : "rgba(10,10,10,.62)",
                outline: activeKey === g.key ? "none" : "1px solid rgba(10,10,10,.1)",
                outlineOffset: -1,
                transition: "background .3s ease, color .3s ease",
              }}
            >
              {g.name}
            </button>
          ))}
        </div>
      </div>

      {/* Sections : toute la carte à la suite */}
      <div style={{ padding: "0 16px" }}>
        {groups.map((g) => (
          <section key={g.key} id={`bcat-${g.key}`} style={{ scrollMarginTop: 118, marginTop: 30 }}>
            <div className="baoma-reveal">
              <h2 style={{ ...BDISPLAY, fontSize: 24, letterSpacing: 0.5, color: BK.ink, lineHeight: 1.05 }}>{g.name}</h2>
              {g.tagline && <p style={{ ...BFF, fontSize: 12, color: "rgba(10,10,10,.55)", marginTop: 3 }}>{g.tagline}</p>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginTop: 14 }}>
              {g.items.map((it) => (
                <BaomaCard key={it.id} item={it} onPick={pick} />
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Barre panier */}
      {cart.length > 0 && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, maxWidth: 480, margin: "0 auto", padding: 12, background: "linear-gradient(to top, rgba(245,245,240,.98) 60%, transparent)" }}>
          <button
            onClick={onCart}
            style={{
              ...BFF, width: "100%", padding: "15px 18px", borderRadius: 14,
              background: BK.orange, color: BK.ink, fontWeight: 800, fontSize: 15,
              display: "flex", justifyContent: "space-between", alignItems: "center",
              boxShadow: "0 8px 26px -6px rgba(255,90,31,.5)",
            }}
          >
            <span>🛒 {t(lang, "cart")} ({count})</span>
            <span>{eur(cart.reduce((s, c) => s + c.lineTotal, 0))}</span>
          </button>
        </div>
      )}
    </div>
  );
}

function ComposeModal({ item, lang, onClose, onAdd }) {
  const [selected, setSelected] = useState([]);
  const [qty, setQty] = useState(1);
  const toggle = (s) => setSelected((p) => (p.find((x) => x.name === s.name) ? p.filter((x) => x.name !== s.name) : [...p, s]));
  return (
    <Modal onClose={onClose}>
      <div style={{ padding: 22 }}>
        <h3 style={{ ...FF }}>{item.emoji} {item.name}</h3>
        {(item.supplements || []).length > 0 && <span style={{ ...FF, fontSize: 13, fontWeight: 600, color: C.textSecondary, display: "block", margin: "12px 0 6px" }}>{t(lang, "supplements")}</span>}
        {(item.supplements || []).map((s) => (
          <label key={s.name} style={{ ...FF, display: "flex", justifyContent: "space-between", padding: "8px 0", fontSize: 14 }}>
            <span><input type="checkbox" onChange={() => toggle(s)} /> {s.name}</span>
            <span>+{eur(s.price)}</span>
          </label>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "14px 0" }}>
          <Btn variant="subtle" size="sm" onClick={() => setQty((q) => Math.max(1, q - 1))}>−</Btn>
          <strong style={{ ...FF }}>{qty}</strong>
          <Btn variant="subtle" size="sm" onClick={() => setQty((q) => q + 1)}>+</Btn>
        </div>
        <Btn variant="primary" size="lg" style={{ width: "100%" }} onClick={() => { onAdd(item, selected, qty); onClose(); }}>
          {t(lang, "addToCart")} — {eur((Number(item.price) + selected.reduce((s, x) => s + Number(x.price), 0)) * qty)}
        </Btn>
      </div>
    </Modal>
  );
}

function CustomerCart({ cart, setCart, lang, subtotal, discount, total, promo, setPromo, restaurant, onBack, onNext }) {
  const toast = useToast();
  const [code, setCode] = useState("");
  const applyPromo = async (raw) => {
    const c = (typeof raw === "string" ? raw : code).trim();
    if (!c) return;
    if (!hasSupabase || restaurant.id === "demo") {
      if (c.toUpperCase() === "BIENVENUE10") setPromo({ code: c, discount_percent: 10 });
      else toast("Code invalide", "error");
      return;
    }
    const { data } = await supabase.from("promo_codes").select("*").eq("restaurant_id", restaurant.id).ilike("code", c).eq("active", true).maybeSingle();
    if (data) {
      setPromo(data);
      toast("Code appliqué !", "success");
    } else toast("Code invalide", "error");
  };

  // Pre-apply a promo arriving via a tracked link (?promo=CODE).
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("promo");
    if (p && !promo) { setCode(p.toUpperCase()); applyPromo(p); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ padding: 16, minHeight: "100vh" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <Btn variant="subtle" size="sm" onClick={onBack}>←</Btn>
        <h2 style={{ ...FF, fontWeight: 800 }}>{t(lang, "cart")}</h2>
      </div>
      {cart.length === 0 ? (
        <p style={{ ...FF, color: C.textSecondary, textAlign: "center", marginTop: 40 }}>{t(lang, "emptyCart")}</p>
      ) : (
        <>
          {cart.map((c) => (
            <Surface key={c.key} style={{ padding: 12, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <strong style={{ ...FF }}>{c.qty}× {c.item.emoji} {c.item.name}</strong>
                {c.supplements.length > 0 && <div style={{ ...FF, fontSize: 12, color: C.textSecondary }}>+ {c.supplements.map((s) => s.name).join(", ")}</div>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <strong style={{ ...FF }}>{eur(c.lineTotal)}</strong>
                <button onClick={() => setCart((p) => p.filter((x) => x.key !== c.key))} style={{ ...FF, color: C.accent }}>✕</button>
              </div>
            </Surface>
          ))}
          <Surface style={{ padding: 14, marginTop: 8 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t(lang, "promoCode")} style={{ ...FF, flex: 1, padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.border}`, textTransform: "uppercase" }} />
              <Btn variant="subtle" onClick={() => applyPromo()}>{t(lang, "apply")}</Btn>
            </div>
            <div style={{ marginTop: 14, ...FF, fontSize: 14 }}>
              <Row label="Sous-total" value={eur(subtotal)} />
              {discount > 0 && <Row label={`${t(lang, "discount")} (${promo?.code})`} value={`−${eur(discount)}`} color={C.accentGreen} />}
              <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 8, paddingTop: 8 }}>
                <Row label={<strong>{t(lang, "total")}</strong>} value={<strong style={{ fontSize: 18 }}>{eur(total)}</strong>} />
              </div>
            </div>
          </Surface>
          <Btn variant="primary" size="lg" style={{ width: "100%", marginTop: 16 }} onClick={onNext}>{t(lang, "checkout")}</Btn>
        </>
      )}
    </div>
  );
}

function Row({ label, value, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", color: color || C.text }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

// Lazily load Stripe.js (no npm dependency) and memoise the instance per key.
let _stripeScript = null;
const _stripeInstances = {};
function loadStripe(publishableKey) {
  if (!publishableKey) return Promise.resolve(null);
  if (_stripeInstances[publishableKey]) return Promise.resolve(_stripeInstances[publishableKey]);
  if (!_stripeScript) {
    _stripeScript = new Promise((resolve, reject) => {
      if (window.Stripe) return resolve();
      const s = document.createElement("script");
      s.src = "https://js.stripe.com/v3/";
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("stripe_load_failed"));
      document.head.appendChild(s);
    });
  }
  return _stripeScript.then(() => {
    if (!window.Stripe) return null;
    _stripeInstances[publishableKey] = window.Stripe(publishableKey);
    return _stripeInstances[publishableKey];
  });
}

function StripeCardForm({ clientSecret, publishableKey, total, lang, onSuccess, onCancel }) {
  const toast = useToast();
  const mountRef = useRef(null);
  const stateRef = useRef({ stripe: null, card: null });
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stripe = await loadStripe(publishableKey);
      if (!stripe || cancelled) {
        toast("Stripe indisponible.", "error");
        return;
      }
      const elements = stripe.elements();
      const card = elements.create("card", {
        style: { base: { fontFamily: FF.fontFamily, fontSize: "16px", color: C.text } },
      });
      card.mount(mountRef.current);
      stateRef.current = { stripe, card };
      setReady(true);
    })();
    return () => {
      cancelled = true;
      stateRef.current.card?.destroy?.();
    };
  }, [publishableKey]);

  const pay = async () => {
    const { stripe, card } = stateRef.current;
    if (!stripe || !card) return;
    setBusy(true);
    try {
      const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, { payment_method: { card } });
      if (error) {
        toast(error.message || "Paiement refusé", "error");
        setBusy(false);
        return;
      }
      if (paymentIntent?.status === "succeeded") onSuccess();
      else {
        toast("Paiement non finalisé.", "error");
        setBusy(false);
      }
    } catch (e) {
      toast(e.message || "Erreur de paiement", "error");
      setBusy(false);
    }
  };

  return (
    <div>
      <div ref={mountRef} style={{ padding: 14, border: `1px solid ${C.borderStrong}`, borderRadius: 12, background: C.surface, marginBottom: 14 }} />
      <Btn variant="blue" size="lg" style={{ width: "100%" }} disabled={!ready || busy} onClick={pay}>
        {busy ? "…" : `${t(lang, "payCard")} — ${eur(total)}`}
      </Btn>
      <button onClick={onCancel} style={{ ...FF, display: "block", margin: "12px auto 0", color: C.textSecondary, fontSize: 14 }}>{t(lang, "back")}</button>
    </div>
  );
}

function CustomerPayment({ restaurant, tableId, orderType, cart, total, promo, profile, lang, onBack, onDone }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [cardIntent, setCardIntent] = useState(null); // { clientSecret, publishableKey }
  // Jeton d'idempotence stable pour toute la durée du paiement : un double-tap
  // ou une reprise réseau réutilise la commande déjà créée au lieu d'en ouvrir
  // une seconde. Renouvelé uniquement à la commande suivante.
  const clientToken = useRef(uid());

  const createOrder = useCallback(async (method) => {
    setBusy(true);
    try {
      if (!hasSupabase || restaurant.id === "demo") {
        // demo: fabricate an id
        await new Promise((r) => setTimeout(r, 600));
        onDone(uid());
        return;
      }
      // Deux flux de paiement strictement séparés :
      //   card → Stripe (PaymentIntent déjà confirmé avant d'arriver ici)
      //   cash → encaissement en caisse, transmis à la caisse via HubRise
      const paymentMode = method === "cash" ? "pay_at_counter" : "online_stripe";

      // Le montant n'est jamais transmis : create_order_secure relit les prix
      // et les taux de TVA en base, décrémente le stock, valide la promo et
      // attribue le numéro fiscal, le tout dans une seule transaction. Un
      // total falsifié côté navigateur n'a donc aucun effet.
      const { data: res, error } = await supabase.rpc("create_order_secure", {
        p_restaurant: restaurant.id,
        p_table: tableId,
        p_order_type: orderType,
        p_payment_method: method,
        p_payment_mode: paymentMode,
        p_customer_name: profile.name || "",
        p_customer_email: profile.email || "",
        p_note: "",
        p_promo_code: promo?.code || null,
        p_items: cart.map((c) => ({
          menu_item_id: c.item.id,
          quantity: c.qty,
          supplements: c.supplements || [],
          detail: (c.supplements || []).map((s) => s.name).join(", "),
        })),
        p_client_token: clientToken.current,
      });
      if (error) throw error;
      const order = { id: res.order_id };

      // Transmission à la caisse. Volontairement après la création (la fonction
      // relit les lignes) et non bloquant : si la caisse est injoignable, la
      // commande reste valide et visible dans la vue cuisine Wegemo, avec son
      // pos_sync_status en échec pour que le restaurateur puisse relancer.
      if (paymentMode === "pay_at_counter") {
        callFunction("hubrise-push-order", { order_id: order.id }).catch(() => {});
      }
      if (promo?.code) {
        // L'usage du code est déjà consommé dans la transaction ci-dessus ;
        // il ne reste que l'attribution marketing, non critique.
        supabase.rpc("track_redemption", { p_restaurant: restaurant.id, p_code: promo.code, p_revenue: res.total }).then(() => {}, () => {});
      }
      // Fire-and-forget receipt email when the customer left an address.
      if (profile.email) {
        const rows = cart.map((c) => `<tr><td>${c.qty}× ${c.item.name}</td><td align="right">${eur(c.lineTotal)}</td></tr>`).join("");
        const html = `<h2>Merci pour votre commande chez ${restaurant.name} !</h2><table style="width:100%">${rows}<tr><td><b>Total</b></td><td align="right"><b>${eur(res.total)}</b></td></tr></table>`;
        callFunction("send-receipt-email", { restaurant_id: restaurant.id, to_email: profile.email, subject: `Reçu n° ${res.fiscal_number} — ${restaurant.name}`, html_body: html }).catch(() => {});
      }
      onDone(order.id);
    } catch (e) {
      // La rupture de stock est le seul échec que le client peut corriger
      // lui-même : on nomme l'article plutôt que d'afficher un code brut.
      const msg = String(e?.message || "");
      if (msg.includes("rupture_stock")) {
        toast(`Plus disponible : ${msg.split("rupture_stock:")[1]?.trim() || "un article"}`, "error");
      } else {
        toast(msg || "Erreur", "error");
      }
      setBusy(false);
    }
  }, [restaurant.id, tableId, orderType, profile, cart, promo, onDone, toast]);

  const payCard = async () => {
    // If the total is exactly 0 (e.g. 100% promo), skip Stripe entirely —
    // the edge function rejects amounts <= 0.
    if (total <= 0) return createOrder("card");
    setBusy(true);
    try {
      if (!hasSupabase || restaurant.id === "demo") {
        // Demo: no real Stripe, just confirm.
        await new Promise((r) => setTimeout(r, 600));
        onDone(uid());
        return;
      }
      const data = await callFunction("create-payment-intent", { amount: total, restaurant_id: restaurant.id });
      if (data?.error || !data?.client_secret) {
        toast("Paiement carte indisponible — payez en espèces.", "error");
        setBusy(false);
        return;
      }
      const pubKey = data.publishable_key || import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
      setCardIntent({ clientSecret: data.client_secret, publishableKey: pubKey });
      setBusy(false);
    } catch (e) {
      toast(e.message || "Erreur", "error");
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: 20, minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <Btn variant="subtle" size="sm" onClick={cardIntent ? () => setCardIntent(null) : onBack}>←</Btn>
        <h2 style={{ ...FF, fontWeight: 800 }}>{t(lang, "total")} : {eur(total)}</h2>
      </div>
      {cardIntent ? (
        <StripeCardForm
          clientSecret={cardIntent.clientSecret}
          publishableKey={cardIntent.publishableKey}
          total={total}
          lang={lang}
          onSuccess={() => createOrder("card")}
          onCancel={() => setCardIntent(null)}
        />
      ) : (
        <>
          <Btn variant="primary" size="lg" style={{ marginBottom: 12 }} disabled={busy} onClick={() => createOrder("cash")}>💵 {t(lang, "payCash")}</Btn>
          <Btn variant="blue" size="lg" disabled={busy} onClick={payCard}>💳 {t(lang, "payCard")}</Btn>
          {busy && <p style={{ ...FF, textAlign: "center", marginTop: 16, color: C.textSecondary }}>…</p>}
        </>
      )}
    </div>
  );
}

function CustomerDone({ orderId, restaurant, settings, lang }) {
  const [status, setStatus] = useState("PENDING");
  const [rating, setRating] = useState(0);
  const [showChat, setShowChat] = useState(false);

  useEffect(() => {
    if (!hasSupabase || restaurant.id === "demo" || !orderId) return;
    const poll = async () => {
      const { data } = await supabase.rpc("get_order_status", { p_order_id: orderId });
      if (data?.[0]) setStatus(data[0].status);
    };
    poll();
    const iv = setInterval(poll, 8000);
    return () => clearInterval(iv);
  }, [orderId, restaurant.id]);

  const steps = ["PENDING", "PREPARING", "READY", "DONE"];
  const idx = steps.indexOf(status);

  const submitReview = async (r) => {
    setRating(r);
    if (hasSupabase && restaurant.id !== "demo") {
      await supabase.from("reviews").insert({ restaurant_id: restaurant.id, order_id: orderId, rating: r });
    }
  };

  return (
    <div style={{ padding: 24, minHeight: "100vh", textAlign: "center" }}>
      <div style={{ fontSize: 60, marginTop: 20 }}>🎉</div>
      <h1 style={{ ...FF, fontWeight: 900, fontSize: 26, margin: "12px 0" }}>{t(lang, "orderConfirmed")}</h1>

      <Surface style={{ padding: 18, margin: "20px 0", textAlign: "left" }}>
        <strong style={{ ...FF }}>{t(lang, "orderTracking")}</strong>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14 }}>
          {steps.map((s, i) => (
            <div key={s} style={{ flex: 1, textAlign: "center" }}>
              <div style={{ width: 30, height: 30, borderRadius: "50%", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center", background: i <= idx ? C.accentGreen : C.border, color: i <= idx ? C.white : C.textTertiary, ...FF, fontWeight: 800, fontSize: 13 }}>{i + 1}</div>
              <div style={{ ...FF, fontSize: 10, marginTop: 4, color: i <= idx ? C.text : C.textTertiary }}>{STATUS_META[s]?.label}</div>
            </div>
          ))}
        </div>
      </Surface>

      <Surface style={{ padding: 18, marginBottom: 16 }}>
        <strong style={{ ...FF }}>{t(lang, "rateOrder")}</strong>
        <div style={{ fontSize: 32, marginTop: 8 }}>
          {[1, 2, 3, 4, 5].map((s) => (
            <button key={s} onClick={() => submitReview(s)} style={{ filter: s <= rating ? "none" : "grayscale(1) opacity(.4)" }}>⭐</button>
          ))}
        </div>
        {settings.google_review_enabled && settings.google_review_url && rating >= 4 && (
          <a href={settings.google_review_url} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 10 }}>
            <Btn variant="blue" size="sm">{t(lang, "leaveGoogleReview")}</Btn>
          </a>
        )}
      </Surface>

      <Btn variant="subtle" onClick={() => setShowChat((v) => !v)}>💬 {t(lang, "askAI")}</Btn>
      {showChat && (
        <Surface style={{ marginTop: 12, overflow: "hidden", textAlign: "left" }}>
          <ChatPanel mode="customer" lang={lang} title={t(lang, "askAI")} context={`Restaurant ${restaurant.name}`} onClose={() => setShowChat(false)} />
        </Surface>
      )}
    </div>
  );
}

/* ============================================================================
 * GMAIL OAUTH CALLBACK
 * ==========================================================================*/
function GmailCallback() {
  const [msg, setMsg] = useState("Connexion en cours…");
  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const rid = sessionStorage.getItem("wgm_gmail_rid");
      if (!code || !rid || !hasSupabase) {
        setMsg("Paramètres manquants.");
        return;
      }
      try {
        const data = await callFunction("gmail-oauth", { code, restaurant_id: rid, redirect_uri: `${window.location.origin}/oauth/gmail` });
        setMsg(data.success ? `Compte ${data.email} connecté ✓` : "Échec de la connexion.");
      } catch {
        setMsg("Erreur lors de la connexion.");
      }
      setTimeout(() => (window.location.href = "/"), 2500);
    })();
  }, []);
  return <CenterMsg emoji="📧" text={msg} />;
}

/* ============================================================================
 * ROOT
 * ==========================================================================*/
function AppInner() {
  const { user, loading, demoUser, setDemoUser, signOut, passwordRecovery } = useAuth();
  const path = window.location.pathname;

  // Customer route: /r/{slug}/t/{tableNum}
  const customerMatch = path.match(/\/r\/([^/]+)\/t\/(\d+)/);
  const goMatch = path.match(/\/go\/([^/?#]+)/);
  const [view, setView] = useState({ page: "landing", restaurant: null });
  const [vertical, setVertical] = useState("resto");

  useEffect(() => {
    if (user && view.page === "landing") setView({ page: "restaurants", restaurant: null });
  }, [user]);

  if (path.includes("/oauth/gmail")) return <GmailCallback />;
  if (passwordRecovery) return <NewPasswordPage />;
  if (goMatch) return <GoRedirect slug={decodeURIComponent(goMatch[1])} />;
  if (customerMatch) {
    const cSlug = decodeURIComponent(customerMatch[1]);
    // Hotel rooms open the guest portal (hub), not the restaurant menu flow.
    if (cSlug === "demo-hotel") return <HotelGuestPortal room={customerMatch[2]} />;
    return <CustomerPage slug={cSlug} tableNum={customerMatch[2]} />;
  }
  if (loading) return <CenterMsg emoji="⏳" text="…" />;

  // Demo mode
  if (demoUser) {
    const demoR = verticalOf(vertical).demo;
    if (view.page === "kitchen") return <KitchenView restaurant={demoR} vertical={vertical} onExit={() => setView({ page: "dashboard", restaurant: demoR })} />;
    if (view.page === "customer") {
      if (vertical === "hotel") return <HotelGuestPortal room="204" />;
      return <CustomerPage slug={demoR.slug} tableNum="1" />;
    }
    if (view.page === "franchise") return <FranchiseDashboard group={DEMO_GROUP} demoMode onExit={() => setView({ page: "dashboard", restaurant: demoR })} />;
    return <DashboardPage restaurant={demoR} vertical={vertical} onBack={() => { setDemoUser(false); setView({ page: "landing" }); }} onKitchen={() => setView({ page: "kitchen" })} onCustomerView={() => setView({ page: "customer" })} onFranchise={vertical === "resto" ? () => setView({ page: "franchise" }) : undefined} />;
  }

  // Authenticated
  if (user) {
    if (view.page === "kitchen" && view.restaurant) return <KitchenView restaurant={view.restaurant} onExit={() => setView({ page: "dashboard", restaurant: view.restaurant })} />;
    if (view.page === "customer" && view.restaurant) return <CustomerPage slug={view.restaurant.slug} tableNum="1" />;
    if (view.page === "franchise" && view.restaurant?.group_id) {
      return <FranchiseDashboard group={{ id: view.restaurant.group_id, name: view.restaurant.name, logo_emoji: "🏢" }} demoMode={false} onExit={() => setView({ page: "dashboard", restaurant: view.restaurant })} />;
    }
    if (view.page === "dashboard" && view.restaurant) {
      return (
        <DashboardPage
          restaurant={view.restaurant}
          onBack={() => setView({ page: "restaurants", restaurant: null })}
          onKitchen={() => setView({ page: "kitchen", restaurant: view.restaurant })}
          onCustomerView={() => setView({ page: "customer", restaurant: view.restaurant })}
          onFranchise={() => setView({ page: "franchise", restaurant: view.restaurant })}
        />
      );
    }
    return <RestaurantsPage onOpen={(r) => setView({ page: "dashboard", restaurant: r })} onSignOut={signOut} />;
  }

  // Public
  if (view.page === "pricing") return <PricingPage onBack={() => setView({ page: "landing" })} onSignup={() => setView({ page: "signup" })} />;
  if (view.page === "login") return <SignupPage initialMode="login" onBack={() => setView({ page: "landing" })} onSuccess={() => setView({ page: "restaurants" })} />;
  if (view.page === "signup") return <SignupPage initialMode="signup" onBack={() => setView({ page: "landing" })} onSuccess={() => setView({ page: "restaurants" })} />;
  return <LandingPage vertical={vertical} setVertical={setVertical} onDemo={() => setDemoUser(true)} onLogin={() => setView({ page: "login" })} onSignup={() => setView({ page: "signup" })} onPricing={() => setView({ page: "pricing" })} />;
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppInner />
      </AuthProvider>
    </ToastProvider>
  );
}
