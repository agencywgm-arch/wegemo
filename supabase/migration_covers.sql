-- Nombre de couverts (convives à table), affiché sur le ticket comme sur une
-- vraie note de restaurant (« Couvert : 2 »). Optionnel : reste vide sur les
-- commandes QR où le client ne le renseigne pas.
alter table orders add column if not exists covers integer;
