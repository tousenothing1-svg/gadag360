-- Royal Harvest: product photos and real stock counts.
--
-- Photos: a public "product-photos" bucket. Anyone can view a photo by its link; only a logged-in
-- admin (the x-staff-token header, checked by public.is_admin()) can upload, replace or delete.
--
-- Stock: products.stock_qty is now the real number of packs left, set in the admin panel.
-- Each pack ordered (any size) takes 1 off; at 0 the product goes out of stock by itself.
-- A customer cancelling puts the packs back (and switches the product back on if it had run out).
-- (Before this, a count of 0 quietly restarted at 100, which only made sense while stock wasn't tracked.)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-photos', 'product-photos', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists product_photos_admin_select on storage.objects;
drop policy if exists product_photos_admin_insert on storage.objects;
drop policy if exists product_photos_admin_update on storage.objects;
drop policy if exists product_photos_admin_delete on storage.objects;
create policy product_photos_admin_select on storage.objects for select to anon, authenticated
  using (bucket_id = 'product-photos' and (select public.is_admin()));
create policy product_photos_admin_insert on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'product-photos' and (select public.is_admin()));
create policy product_photos_admin_update on storage.objects for update to anon, authenticated
  using (bucket_id = 'product-photos' and (select public.is_admin()))
  with check (bucket_id = 'product-photos' and (select public.is_admin()));
create policy product_photos_admin_delete on storage.objects for delete to anon, authenticated
  using (bucket_id = 'product-photos' and (select public.is_admin()));

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

  insert into public.order_items (order_id, product_id, db_product_id, product_name, quantity, price, variant, position)
  select v_id, left(e.value ->> 'product_id', 80),
         left(coalesce(nullif(e.value ->> 'db_id', ''), e.value ->> 'product_id'), 80),
         left(btrim(e.value ->> 'product_name'), 120), (e.value ->> 'quantity')::int, (e.value ->> 'price')::int,
         left(nullif(e.value ->> 'variant', ''), 60), e.ord::int
    from jsonb_array_elements(v_items) with ordinality as e(value, ord);

  -- take the packs off the shelf; at 0 the product goes out of stock (an empty count means "not counted")
  update public.products p
     set stock_qty = case when p.stock_qty is null then null else greatest(0, p.stock_qty - q.qty) end,
         in_stock = case when p.stock_qty is not null and p.stock_qty - q.qty <= 0 then false else p.in_stock end
    from (select coalesce(nullif(e.value ->> 'db_id', ''), e.value ->> 'product_id') as pid,
                 sum((e.value ->> 'quantity')::int) as qty
            from jsonb_array_elements(v_items) e group by 1) q
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
  -- put the packs back; a product that had run out comes back on (one switched off by hand stays off)
  update public.products p
     set stock_qty = case when p.stock_qty is null then null else p.stock_qty + q.qty end,
         in_stock = case when p.stock_qty is not null and p.stock_qty <= 0 then true else p.in_stock end
    from (select i.db_product_id as pid, sum(i.quantity) as qty
            from public.order_items i
           where i.order_id = p_id and i.db_product_id is not null
           group by 1) q
   where p.id = q.pid;
  return jsonb_build_object('ok', true, 'status', 'cancelled');
end $$;

-- Market price for the product's base pack: shown crossed out next to our price when it is higher.
alter table public.products add column if not exists market_price int
  check (market_price is null or market_price >= 0);
