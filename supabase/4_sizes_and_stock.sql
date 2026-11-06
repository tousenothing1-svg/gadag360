-- Royal Harvest: sizes, and stock counted by size.
--
-- A product's price is for its unit ("500g", "1kg", "1pc", "1 bunch"). Customers can pick other sizes of the same
-- kind: products.variants lists them (empty means the usual ones for the unit: 250g · 500g · 1kg, 1pc · 2pc …) and
-- each is priced from the unit's price. The shop and the admin panel work the sizes out with the same rules.
--
-- Stock is now counted in units and can have decimals: selling 1kg of a 500g product takes 2 off, 250g takes 0.5.
-- Each order line records the stock it used (order_items.stock_used), so a cancel puts back exactly that.

alter table public.products alter column stock_qty type numeric using stock_qty::numeric;
alter table public.order_items add column if not exists stock_used numeric;

-- "250g" → (250, g), "1kg" → (1000, g), "1L" → (1000, ml), "2pc" → (2, pc), "1 bunch" → (1, bunch).
-- Same rules as parseSize() in src/App.js and public/admin.html. Anything else gives (null, null).
create or replace function public.size_parts(t text, out n numeric, out u text)
language plpgsql immutable set search_path = ''
as $$
declare m text[];
begin
  m := regexp_match(lower(btrim(coalesce(t, ''))), '^([0-9]+(?:\.[0-9]+)?)\s*([a-z]+)$');
  if m is null then return; end if;
  case m[2]
    when 'kg', 'kgs' then n := m[1]::numeric * 1000; u := 'g';
    when 'g', 'gm', 'gms', 'gram', 'grams' then n := m[1]::numeric; u := 'g';
    when 'ml' then n := m[1]::numeric; u := 'ml';
    when 'l', 'ltr', 'litre', 'liter', 'lit' then n := m[1]::numeric * 1000; u := 'ml';
    when 'pc', 'pcs', 'piece', 'pieces' then n := m[1]::numeric; u := 'pc';
    when 'bunch', 'bunches' then n := m[1]::numeric; u := 'bunch';
    when 'pack', 'packs', 'packet', 'packets' then n := m[1]::numeric; u := 'pack';
    when 'box', 'boxes', 'peti' then n := m[1]::numeric; u := 'box';
    else return;
  end case;
  n := round(n, 3);
  if n <= 0 then n := null; u := null; end if;
end $$;

-- How many units one pack of a size uses: size_ratio('1kg', '500g') = 2, size_ratio('250g', '1kg') = 0.25.
-- Different kinds, or a size it can't read, count as 1 (the old rule: one pack, one off).
create or replace function public.size_ratio(p_size text, p_unit text)
returns numeric language sql immutable set search_path = ''
as $$
  select coalesce((select case when s.u = b.u then s.n / b.n end
                     from public.size_parts(p_size) s, public.size_parts(p_unit) b), 1)
$$;

revoke execute on function public.size_parts(text) from public, anon, authenticated;
revoke execute on function public.size_ratio(text, text) from public, anon, authenticated;

create or replace function public.place_order(p_token text, p_device text, p_order jsonb)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_dev text;
  v_uid uuid; v_trusted boolean := false;
  v_id text := p_order ->> 'id';
  v_items jsonb := p_order -> 'items';
  v_item jsonb;
  v_sub bigint := 0; v_fee int; v_disc int; v_tip int := 0; v_total bigint; v_coins int; v_balance int;
  v_lat float8; v_lon float8;
  v_payment text := coalesce(p_order ->> 'payment', 'cod');
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

  v_fee := case when v_sub > 0 and v_sub < 250 then 15 else 0 end;
  v_disc := case when v_sub >= 299 then 20 else 0 end;
  if coalesce(p_order ->> 'tip', '') ~ '^[0-9]{1,4}$' then
    v_tip := least((p_order ->> 'tip')::int, 500);
  end if;
  v_total := v_sub + v_fee - v_disc + v_tip;
  if v_total > 1000000 then return jsonb_build_object('ok', false, 'error', 'too_big'); end if;
  v_coins := ((v_sub + v_fee - v_disc) / 10)::int;

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
  values (v_id, v_uid, 'placed', v_total, v_fee, v_disc, v_tip, left(coalesce(p_order ->> 'address', ''), 500),
          v_lat, v_lon, left(coalesce(nullif(p_order ->> 'delivery_slot', ''), 'Standard'), 60),
          v_payment, v_dev, v_coins);

  -- each line also records the stock it uses: quantity × (its size ÷ the product's unit)
  insert into public.order_items (order_id, product_id, db_product_id, product_name, quantity, price, variant, position, stock_used)
  select v_id, left(e.value ->> 'product_id', 80),
         left(coalesce(nullif(e.value ->> 'db_id', ''), e.value ->> 'product_id'), 80),
         left(btrim(e.value ->> 'product_name'), 120), (e.value ->> 'quantity')::int, (e.value ->> 'price')::int,
         left(nullif(e.value ->> 'variant', ''), 60), e.ord::int,
         round((e.value ->> 'quantity')::int * public.size_ratio(e.value ->> 'variant', pr.unit), 3)
    from jsonb_array_elements(v_items) with ordinality as e(value, ord)
    left join public.products pr
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

  if v_uid is not null then
    update public.users set coins = coalesce(coins, 0) + v_coins where id = v_uid returning coins into v_balance;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id, 'total', v_total, 'coins_earned', v_coins,
                            'coins', case when v_trusted then v_balance end);
end $$;

create or replace function public.cancel_order(p_device text, p_id text)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare v_status text;
begin
  if coalesce(p_device, '') !~ '^[A-Za-z0-9_-]{16,128}$' then
    return jsonb_build_object('ok', false, 'error', 'bad_device');
  end if;
  select o.status into v_status
    from public.orders o
   where o.id = p_id and o.device_hash = public.sha256_hex(p_device)
     for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_status = 'cancelled' then return jsonb_build_object('ok', true, 'status', 'cancelled'); end if;
  if v_status in ('pickedup', 'picked_up', 'delivered') then
    return jsonb_build_object('ok', false, 'error', 'on_the_way', 'status', v_status);
  end if;
  update public.orders set status = 'cancelled' where id = p_id; -- the trigger takes the coins back
  -- put back the stock the order used; a product that had run out comes back on (one switched off by hand stays off)
  update public.products p
     set stock_qty = case when p.stock_qty is null then null else p.stock_qty + q.used end,
         in_stock = case when p.stock_qty is not null and p.stock_qty <= 0 then true else p.in_stock end
    from (select i.db_product_id as pid, sum(coalesce(i.stock_used, i.quantity)) as used
            from public.order_items i
           where i.order_id = p_id and i.db_product_id is not null
           group by 1) q
   where p.id = q.pid;
  return jsonb_build_object('ok', true, 'status', 'cancelled');
end $$;
