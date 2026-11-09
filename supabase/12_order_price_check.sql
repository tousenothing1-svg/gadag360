-- Royal Harvest: the database checks every order's prices against the product list.
--
-- Before, place_order took each item's price from the customer's phone, so a changed app could order at any price.
-- Now each line must cost exactly what the product list says for that size, worked out the shop's way (src/App.js,
-- sizeOptions): price × size ÷ unit, rounded to the rupee, only for the sizes on offer (the admin's list, or the
-- usual ones for the unit, plus the unit itself) and only when that comes to ₹1 or more.
-- A phone with an old or made-up price gets "price_changed" with the right prices, and the shop updates the cart.
-- Products that aren't in the list are refused as "unavailable", like deleted ones.

-- The usual sizes for a unit (the shop's defaultSizes): 250g · 500g · 1kg by weight, smaller packs for spices,
-- 1pc · 2pc, 1 · 2 bunches or packs; anything else only the unit itself.
create or replace function public.default_sizes(p_unit text)
returns text[] language plpgsql immutable set search_path = ''
as $$
declare v_n numeric; v_u text;
begin
  select s.n, s.u into v_n, v_u from public.size_parts(p_unit) s;
  if v_n is null then return '{}'::text[]; end if;
  if v_u = 'g' then
    return case v_n
      when 10 then array['10g', '20g', '50g'] when 20 then array['20g', '50g', '100g'] when 25 then array['25g', '50g', '100g']
      when 50 then array['50g', '100g', '250g'] when 100 then array['100g', '250g', '500g'] when 200 then array['200g', '500g', '1kg']
      when 250 then array['250g', '500g', '1kg'] when 500 then array['250g', '500g', '1kg'] when 1000 then array['250g', '500g', '1kg']
      else array[p_unit] end;
  end if;
  if v_u = 'pc' and v_n <= 2 then return array['1pc', '2pc']; end if;
  if v_u in ('bunch', 'pack') and v_n = 1 then return array['1 ' || v_u, '2 ' || v_u]; end if;
  return array[p_unit];
end $$;

-- What one size of a product costs (the shop's sizeOptions). Null: that size isn't sold. No size: the unit.
-- A unit the shop can't read sells only as itself, at the product's price.
create or replace function public.size_price(p_price integer, p_unit text, p_variants jsonb, p_size text)
returns integer language plpgsql immutable set search_path = ''
as $$
declare
  v_bn numeric; v_bu text; v_wn numeric; v_wu text; v_sn numeric; v_su text;
  v_labels text[]; v_label text; v_pr integer;
begin
  if coalesce(p_price, 0) <= 0 then return null; end if;
  select s.n, s.u into v_bn, v_bu from public.size_parts(p_unit) s;
  if v_bn is null then
    return case when nullif(btrim(coalesce(p_size, '')), '') is null
                  or lower(btrim(p_size)) = lower(btrim(coalesce(p_unit, ''))) then p_price end;
  end if;
  if nullif(btrim(coalesce(p_size, '')), '') is null then
    v_wn := v_bn; v_wu := v_bu;
  else
    select s.n, s.u into v_wn, v_wu from public.size_parts(p_size) s;
  end if;
  if v_wn is null or v_wu is distinct from v_bu then return null; end if;
  if jsonb_typeof(p_variants) = 'array' and jsonb_array_length(p_variants) > 0 then
    select array_agg(case when jsonb_typeof(e) = 'object' then e ->> 'label' else e #>> '{}' end)
      into v_labels from jsonb_array_elements(p_variants) e;
  else
    v_labels := public.default_sizes(p_unit);
  end if;
  v_labels := coalesce(v_labels, '{}'::text[]) || p_unit;
  foreach v_label in array v_labels loop
    v_sn := null; v_su := null;
    select s.n, s.u into v_sn, v_su from public.size_parts(v_label) s;
    if v_sn = v_wn and v_su = v_bu then
      v_pr := round(p_price * v_sn / v_bn);
      return case when v_pr >= 1 then v_pr end;
    end if;
  end loop;
  return null;
end $$;
revoke all on function public.default_sizes(text) from public, anon, authenticated;
revoke all on function public.size_price(integer, text, jsonb, text) from public, anon, authenticated;

-- place_order: as before, plus the price check and the product name from the list
create or replace function public.place_order(p_token text, p_device text, p_order jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  v_dev text;
  v_uid uuid; v_trusted boolean := false;
  v_id text := p_order ->> 'id';
  v_items jsonb := p_order -> 'items';
  v_item jsonb;
  v_sub bigint := 0; v_fee int; v_tip int := 0; v_total bigint;
  v_lat float8; v_lon float8;
  v_payment text := coalesce(p_order ->> 'payment', 'cod');
  v_gone jsonb; v_gone_db jsonb;
  v_changed jsonb; v_fresh jsonb;
begin
  if coalesce(p_device, '') !~ '^[A-Za-z0-9_-]{16,128}$' then
    return jsonb_build_object('ok', false, 'error', 'bad_device');
  end if;
  v_dev := public.sha256_hex(p_device);
  if coalesce(v_id, '') !~ '^RH[A-Z0-9]{8}$' then
    return jsonb_build_object('ok', false, 'error', 'bad_order_id');
  end if;

  if exists (select 1 from public.orders o where o.id = v_id) then
    if exists (select 1 from public.orders o where o.id = v_id and o.device_hash = v_dev) then
      return (select jsonb_build_object('ok', true, 'id', o.id, 'total', o.total,
                                        'coins_earned', o.coins_earned, 'repeat', true)
                from public.orders o where o.id = v_id);
    end if;
    return jsonb_build_object('ok', false, 'error', 'duplicate');
  end if;

  if jsonb_typeof(v_items) is distinct from 'array' then
    return jsonb_build_object('ok', false, 'error', 'bad_items');
  end if;
  if jsonb_array_length(v_items) not between 1 and 100 then
    return jsonb_build_object('ok', false, 'error', 'bad_items');
  end if;
  for v_item in select value from jsonb_array_elements(v_items) loop
    if jsonb_typeof(v_item) is distinct from 'object'
       or coalesce(v_item ->> 'quantity', '') !~ '^[0-9]{1,3}$'
       or coalesce(v_item ->> 'price', '') !~ '^[0-9]{1,6}$'
       or coalesce(btrim(v_item ->> 'product_name'), '') = '' then
      return jsonb_build_object('ok', false, 'error', 'bad_items');
    end if;
    if (v_item ->> 'quantity')::int < 1 then
      return jsonb_build_object('ok', false, 'error', 'bad_items');
    end if;
    v_sub := v_sub + (v_item ->> 'quantity')::bigint * (v_item ->> 'price')::bigint;
  end loop;

  -- not in the product list, or deleted in the admin panel: not for sale
  select jsonb_agg(distinct coalesce(e.value ->> 'product_id', pr.id)),
         jsonb_agg(distinct left(coalesce(nullif(e.value ->> 'db_id', ''), e.value ->> 'product_id'), 80))
    into v_gone, v_gone_db
    from jsonb_array_elements(v_items) e
    left join public.products pr
      on pr.id = left(coalesce(nullif(e.value ->> 'db_id', ''), e.value ->> 'product_id'), 80)
   where pr.id is null or pr.deleted_at is not null;
  if v_gone is not null then
    return jsonb_build_object('ok', false, 'error', 'unavailable', 'items', v_gone, 'db_ids', v_gone_db);
  end if;

  -- prices come from the product list, never from the phone: each line must cost what its size costs now
  select jsonb_agg(jsonb_build_object(
           'product_id', e.value ->> 'product_id',
           'db_id', pr.id,
           'variant', nullif(e.value ->> 'variant', ''),
           'was', (e.value ->> 'price')::int,
           'price', public.size_price(pr.price, pr.unit, pr.variants, e.value ->> 'variant')) order by e.ord),
         jsonb_object_agg(pr.id, jsonb_build_object('price', pr.price, 'unit', pr.unit, 'variants', pr.variants))
    into v_changed, v_fresh
    from jsonb_array_elements(v_items) with ordinality as e(value, ord)
    join public.products pr
      on pr.id = left(coalesce(nullif(e.value ->> 'db_id', ''), e.value ->> 'product_id'), 80)
   where public.size_price(pr.price, pr.unit, pr.variants, e.value ->> 'variant') is distinct from (e.value ->> 'price')::int;
  if v_changed is not null then
    return jsonb_build_object('ok', false, 'error', 'price_changed', 'items', v_changed, 'products', v_fresh);
  end if;

  v_fee := case when v_sub > 0 and v_sub < 250 then 15 else 0 end;
  if coalesce(p_order ->> 'tip', '') ~ '^[0-9]{1,4}$' then
    v_tip := least((p_order ->> 'tip')::int, 500);
  end if;
  v_total := v_sub + v_fee + v_tip;
  if v_total > 1000000 then return jsonb_build_object('ok', false, 'error', 'too_big'); end if;

  if jsonb_typeof(p_order -> 'gps_lat') = 'number' and jsonb_typeof(p_order -> 'gps_lon') = 'number' then
    v_lat := (p_order ->> 'gps_lat')::float8;
    v_lon := (p_order ->> 'gps_lon')::float8;
    if v_lat not between -90 and 90 or v_lon not between -180 and 180 then
      v_lat := null; v_lon := null;
    end if;
  end if;
  if v_payment not in ('cod', 'online', 'upi') then v_payment := 'cod'; end if;

  if coalesce(p_token, '') <> '' then
    select c.user_id, c.trusted into v_uid, v_trusted from public.customer_session_row(p_token) c;
    v_trusted := coalesce(v_trusted, false);
  end if;

  if (select count(*) from public.orders o
       where o.device_hash = v_dev and o.created_at > (now() at time zone 'UTC') - interval '1 hour') >= 15 then
    return jsonb_build_object('ok', false, 'error', 'slow_down');
  end if;

  insert into public.orders (id, user_id, status, total, delivery_fee, discount, tip, address,
                             gps_lat, gps_lon, delivery_slot, payment, device_hash, coins_earned)
  values (v_id, v_uid, 'placed', v_total, v_fee, 0, v_tip, left(coalesce(p_order ->> 'address', ''), 500),
          v_lat, v_lon, left(coalesce(nullif(p_order ->> 'delivery_slot', ''), 'Standard'), 60),
          v_payment, v_dev, 0);

  -- each line also records the stock it uses: quantity × (its size ÷ the product's unit); the name comes from the list
  insert into public.order_items (order_id, product_id, db_product_id, product_name, quantity, price, variant, position, stock_used)
  select v_id, left(e.value ->> 'product_id', 80),
         pr.id,
         left(btrim(coalesce(pr.name, e.value ->> 'product_name')), 120), (e.value ->> 'quantity')::int, (e.value ->> 'price')::int,
         left(nullif(e.value ->> 'variant', ''), 60), e.ord::int,
         round((e.value ->> 'quantity')::int * public.size_ratio(e.value ->> 'variant', pr.unit), 3)
    from jsonb_array_elements(v_items) with ordinality as e(value, ord)
    join public.products pr
      on pr.id = left(coalesce(nullif(e.value ->> 'db_id', ''), e.value ->> 'product_id'), 80);

  -- take that stock off the shelf; at 0 the product goes out of stock (an empty count means "not counted")
  update public.products p
     set stock_qty = case when p.stock_qty is null then null else greatest(0, p.stock_qty - q.used) end,
         in_stock = case when p.stock_qty is not null and p.stock_qty - q.used <= 0 then false else p.in_stock end
    from (select i.db_product_id as pid, sum(coalesce(i.stock_used, i.quantity)) as used
            from public.order_items i
           where i.order_id = v_id and i.db_product_id is not null
           group by 1) q
   where p.id = q.pid;

  return jsonb_build_object('ok', true, 'id', v_id, 'total', v_total, 'coins_earned', 0);
end $function$;
