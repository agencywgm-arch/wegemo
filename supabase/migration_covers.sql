-- Nombre de couverts par commande, saisi côté client juste après le choix
-- "sur place" (uniquement pour ce mode — pas de pertinence à emporter),
-- avant l'affichage du menu.
--
-- p_covers est ajouté en dernier paramètre AVEC une valeur par défaut, pour
-- que tous les appels existants (POS comptoir, ancien flux QR sans couverts)
-- continuent de fonctionner sans modification. Ajouter un paramètre change
-- la signature : CREATE OR REPLACE ne suffit pas (ça créerait un second
-- surcharge ambigu à côté de l'ancienne fonction à 11 arguments) — il faut
-- d'abord supprimer explicitement l'ancienne.
alter table orders
  add column if not exists covers int not null default 1
    check (covers between 1 and 30);

drop function if exists create_order_secure(uuid, uuid, text, text, text, text, text, text, text, jsonb, text);

create or replace function create_order_secure(
  p_restaurant     uuid,
  p_table          uuid,
  p_order_type     text,
  p_payment_method text,
  p_payment_mode   text,
  p_customer_name  text,
  p_customer_email text,
  p_note           text,
  p_promo_code     text,
  p_items          jsonb,
  p_client_token   text,
  p_covers         int default 1
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_item        jsonb;
  v_id          uuid;
  v_qty         int;
  v_row         menu_items%rowtype;
  v_sup_total   numeric(10,2);
  v_line_ttc    numeric(10,2);
  v_subtotal    numeric(10,2) := 0;
  v_discount    numeric(10,2) := 0;
  v_total       numeric(10,2);
  v_promo       promo_codes%rowtype;
  v_order_id    uuid;
  v_existing    orders%rowtype;
  v_year        int := extract(year from now());
  v_seq         bigint;
  v_fiscal      text;
  v_vat         jsonb;
  v_prev_hash   text;
  v_hash        text;
  v_ratio       numeric;
  v_lines       jsonb := '[]'::jsonb;
begin
  if p_restaurant is null then
    raise exception 'restaurant_manquant';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'commande_vide';
  end if;

  -- Idempotence : un même jeton renvoie la commande déjà créée.
  if p_client_token is not null then
    select * into v_existing from orders
     where restaurant_id = p_restaurant and client_token = p_client_token;
    if found then
      return jsonb_build_object(
        'order_id', v_existing.id, 'fiscal_number', v_existing.fiscal_number,
        'total', v_existing.total, 'vat_breakdown', v_existing.vat_breakdown,
        'duplicate', true);
    end if;
  end if;

  -- --- Lignes : prix et TVA lus en base, stock décrémenté de façon atomique ---
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_id  := (v_item->>'menu_item_id')::uuid;
    v_qty := greatest(1, coalesce((v_item->>'quantity')::int, 1));

    -- Le WHERE porte la condition de stock : deux commandes simultanées sur le
    -- dernier article ne peuvent pas réussir toutes les deux.
    update menu_items
       set stock = case when stock is null then null else stock - v_qty end
     where id = v_id
       and restaurant_id = p_restaurant
       and available = true
       and (stock is null or stock >= v_qty)
    returning * into v_row;

    if not found then
      -- On distingue rupture de stock et article inconnu pour l'affichage.
      if exists (select 1 from menu_items where id = v_id and restaurant_id = p_restaurant) then
        raise exception 'rupture_stock:%', (select name from menu_items where id = v_id);
      else
        raise exception 'article_introuvable';
      end if;
    end if;

    -- Les suppléments sont facturés au taux de TVA de l'article porteur.
    v_sup_total := coalesce((
      select sum((s->>'price')::numeric)
        from jsonb_array_elements(coalesce(v_item->'supplements', '[]'::jsonb)) s
    ), 0);

    v_line_ttc := round((v_row.price + v_sup_total) * v_qty, 2);
    v_subtotal := v_subtotal + v_line_ttc;

    v_lines := v_lines || jsonb_build_object(
      'menu_item_id', v_id, 'quantity', v_qty, 'name', v_row.name,
      'unit_price', v_row.price, 'line_ttc', v_line_ttc, 'vat_rate', v_row.vat_rate,
      'detail', coalesce(v_item->>'detail', ''));
  end loop;

  -- --- Promotion : validée et consommée côté serveur -------------------------
  if p_promo_code is not null and length(trim(p_promo_code)) > 0 then
    -- FOR UPDATE : empêche de dépasser max_uses lors d'un pic de commandes.
    select * into v_promo from promo_codes
     where restaurant_id = p_restaurant
       and lower(code) = lower(trim(p_promo_code))
       and active = true
     for update;

    if found
       and (v_promo.start_date is null or v_promo.start_date <= current_date)
       and (v_promo.end_date   is null or v_promo.end_date   >= current_date)
       and (v_promo.max_uses   is null or v_promo.use_count < v_promo.max_uses)
    then
      v_discount := round(
        case when v_promo.discount_percent is not null
             then v_subtotal * v_promo.discount_percent / 100.0
             else least(coalesce(v_promo.discount_amount, 0), v_subtotal) end, 2);
      update promo_codes set use_count = use_count + 1 where id = v_promo.id;
    else
      v_discount := 0; -- code expiré, épuisé ou inconnu : ignoré silencieusement
    end if;
  end if;

  v_total := greatest(0, round(v_subtotal - v_discount, 2));

  -- --- Ventilation de TVA -----------------------------------------------------
  -- Prix TTC : la TVA est extraite (base HT = TTC / (1 + taux)). La remise est
  -- répartie au prorata de chaque taux pour rester juste sur le ticket.
  v_ratio := case when v_subtotal > 0 then v_total / v_subtotal else 1 end;

  select coalesce(jsonb_agg(x order by x->>'rate'), '[]'::jsonb) into v_vat from (
    select jsonb_build_object(
      'rate', rate,
      'base_ht', round(sum(ttc) * v_ratio / (1 + rate / 100.0), 2),
      'vat',     round(sum(ttc) * v_ratio - sum(ttc) * v_ratio / (1 + rate / 100.0), 2),
      'total_ttc', round(sum(ttc) * v_ratio, 2)
    ) as x
    from (
      select (l->>'vat_rate')::numeric as rate, (l->>'line_ttc')::numeric as ttc
        from jsonb_array_elements(v_lines) l
    ) t group by rate
  ) agg;

  -- --- Numéro fiscal séquentiel ------------------------------------------------
  insert into fiscal_counters (restaurant_id, year, last_number)
       values (p_restaurant, v_year, 1)
  on conflict (restaurant_id, year)
    do update set last_number = fiscal_counters.last_number + 1
  returning last_number into v_seq;

  v_fiscal := v_year::text || '-' || lpad(v_seq::text, 6, '0');

  -- --- Écriture de la commande -------------------------------------------------
  insert into orders (
    restaurant_id, table_id, status, note, total, subtotal, discount,
    payment_method, customer_name, customer_email, order_type, covers,
    fiscal_number, vat_breakdown, client_token
  ) values (
    p_restaurant, p_table, 'PENDING', coalesce(p_note, ''), v_total, v_subtotal, v_discount,
    coalesce(p_payment_method, 'cash'), coalesce(p_customer_name, ''),
    coalesce(p_customer_email, ''), coalesce(p_order_type, 'dine_in'),
    greatest(1, least(30, coalesce(p_covers, 1))),
    v_fiscal, v_vat, p_client_token
  ) returning id into v_order_id;

  insert into order_items (order_id, menu_item_id, quantity, detail)
  select v_order_id, (l->>'menu_item_id')::uuid, (l->>'quantity')::int, l->>'detail'
    from jsonb_array_elements(v_lines) l;

  -- --- Journal chaîné ----------------------------------------------------------
  select hash into v_prev_hash from fiscal_journal
   where restaurant_id = p_restaurant order by recorded_at desc, fiscal_number desc limit 1;

  -- Chaque empreinte intègre la précédente : modifier une ligne passée rendrait
  -- toutes les suivantes incohérentes, ce qui rend l'altération détectable.
  v_hash := encode(digest(
    coalesce(v_prev_hash, '') || '|' || v_fiscal || '|' || v_total::text || '|' ||
    coalesce(v_vat::text, '') || '|' || coalesce(p_payment_method, 'cash') || '|' ||
    v_order_id::text, 'sha256'), 'hex');

  insert into fiscal_journal (
    restaurant_id, order_id, fiscal_number, total_ttc, vat_breakdown,
    payment_method, prev_hash, hash
  ) values (
    p_restaurant, v_order_id, v_fiscal, v_total, v_vat,
    coalesce(p_payment_method, 'cash'), v_prev_hash, v_hash
  );

  return jsonb_build_object(
    'order_id', v_order_id, 'fiscal_number', v_fiscal, 'total', v_total,
    'subtotal', v_subtotal, 'discount', v_discount, 'vat_breakdown', v_vat,
    'duplicate', false);
end; $$;

grant execute on function create_order_secure(uuid, uuid, text, text, text, text, text, text, text, jsonb, text, int)
  to anon, authenticated;
