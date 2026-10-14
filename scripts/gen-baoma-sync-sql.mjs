import { BAOMA_MENU, BAOMA_CATEGORIES } from "../src/baomaData.js";

const order = BAOMA_CATEGORIES.map((c) => c.name);
// Listes d'options identiques regroupées : chaque liste n'est écrite qu'une fois.
const sets = new Map(); // json -> { key, items: [] }
const items = BAOMA_MENU.map((m) => {
  const sup = m.supplements || [];
  let opts = null;
  if (sup.length) {
    const json = JSON.stringify(sup);
    if (!sets.has(json)) sets.set(json, { key: `o${sets.size + 1}`, names: [] });
    const set = sets.get(json);
    set.names.push(m.name);
    opts = set.key;
  }
  return { name: m.name, description: m.description, price: m.price, category: m.category, emoji: m.emoji,
    photo_url: m.photo_url, is_popular: !!m.is_popular, sort_order: m.sort_order, is_menu: !!m.is_menu, opts };
});
const setsObj = {};
const setsDoc = [];
for (const [json, { key, names }] of sets) {
  setsObj[key] = JSON.parse(json);
  setsDoc.push(`--   ${key} : ${names.join(", ")}`);
}
const itemLines = items.map((i) => "  " + JSON.stringify(i)).join(",\n");
const setLines = Object.entries(setsObj).map(([k, v]) => `    "${k}": ${JSON.stringify(v)}`).join(",\n");

process.stdout.write(`-- Synchronisation de la carte Baoma sur TOUS les comptes Baoma.
-- À coller dans l'éditeur SQL Supabase puis « Run ». Relançable sans risque.
--
-- Comptes concernés : slug commençant par « baoma » + restaurants du même groupe
-- franchise que « baoma ». Les autres restaurants ne sont pas touchés.
-- Pour chaque compte : les plats de la carte officielle sont créés ou mis à jour
-- (nom, description, prix, photo, ordre, options) ; stock et TVA ne changent pas ;
-- tout plat hors carte officielle est DÉSACTIVÉ (available = false), jamais
-- supprimé (order_items référence menu_items) ; l'ordre des catégories est mis à jour.
-- Liste d'options utilisées par chaque plat :
${setsDoc.join("\n")}
-- Généré depuis src/baomaData.js : ne pas éditer à la main.

create or replace function sync_baoma_menu() returns void
language plpgsql as $fn$
declare
  v_opts  jsonb := $json$
  {
${setLines}
  }
  $json$::jsonb;
  v_items jsonb := $json$
  [
${itemLines}
  ]
  $json$::jsonb;
  v_order jsonb := '${JSON.stringify(order).replace(/'/g, "''")}'::jsonb;
  v_group uuid;
  r record;
  it jsonb;
  v_sup jsonb;
begin
  select group_id into v_group from restaurants where slug = 'baoma';

  for r in
    select id, slug, name from restaurants
     where slug like 'baoma%' or (v_group is not null and group_id = v_group)
  loop
    raise notice 'Carte synchronisée : % (%)', r.name, r.slug;

    for it in select * from jsonb_array_elements(v_items) loop
      v_sup := case when it->>'opts' is null then '[]'::jsonb else v_opts->(it->>'opts') end;

      update menu_items set
             description = it->>'description',
             price       = (it->>'price')::numeric,
             emoji       = it->>'emoji',
             photo_url   = it->>'photo_url',
             is_popular  = (it->>'is_popular')::boolean,
             sort_order  = (it->>'sort_order')::int,
             is_menu     = (it->>'is_menu')::boolean,
             supplements = v_sup,
             available   = true
       where restaurant_id = r.id and name = it->>'name' and category = it->>'category';

      if not found then
        insert into menu_items (restaurant_id, name, description, price, category, emoji,
                                photo_url, is_popular, available, sort_order, is_menu, supplements)
        values (r.id, it->>'name', it->>'description', (it->>'price')::numeric, it->>'category',
                it->>'emoji', it->>'photo_url', (it->>'is_popular')::boolean, true,
                (it->>'sort_order')::int, (it->>'is_menu')::boolean, v_sup);
      end if;
    end loop;

    update menu_items m set available = false
     where m.restaurant_id = r.id and m.available = true
       and not exists (
         select 1 from jsonb_array_elements(v_items) c
          where c->>'name' = m.name and c->>'category' = m.category);

    insert into restaurant_settings (restaurant_id, category_order)
    values (r.id, v_order)
    on conflict (restaurant_id) do update set category_order = excluded.category_order;
  end loop;
end
$fn$;

select sync_baoma_menu();

-- Vérification : plats actifs / désactivés par compte Baoma.
select r.slug, count(*) filter (where m.available) as plats_actifs,
       count(*) filter (where not m.available) as plats_desactives
  from restaurants r join menu_items m on m.restaurant_id = r.id
 where r.slug like 'baoma%'
    or r.group_id = (select group_id from restaurants where slug = 'baoma' and group_id is not null)
 group by r.slug order by r.slug;
`);
