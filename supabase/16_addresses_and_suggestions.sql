-- Royal Harvest: saved delivery addresses, a typed address on every order, and product suggestions with a photo.
--
-- 1. Saved addresses. A customer can keep up to 3 delivery addresses (for example Home, and a parent's house when
--    ordering for someone else): a name, the typed address and, if they pinned it, the spot on the map. They're kept
--    with the account in users.addresses and shown only to a phone the account trusts (the same rule as the saved
--    name and email), so typing someone else's number shows nothing.
-- 2. A typed address on every order. A GPS pin alone doesn't get the delivery boy to the door, so place_order now
--    needs at least 10 typed characters (house no., street, landmark). place_order is otherwise exactly as in
--    15_pay_on_delivery.sql.
-- 3. Product suggestions. A customer suggests a product by name, with a short note and a photo if they like. They're
--    saved in public.product_suggestions (the photo is shrunk on the phone first and stored with the row) and shown
--    in the admin panel's Suggestions page. A few a day per phone, so nobody can fill the database.

-- ── 1. Saved addresses ──────────────────────────────────────────────────────
alter table public.users add column if not exists addresses jsonb not null default '[]'::jsonb;

-- A list from a phone, cleaned: at most 3, each with a name and a typed address of 10+ characters; a map spot only
-- when it's a real one in India
create or replace function public.clean_addresses(p jsonb)
returns jsonb language sql immutable set search_path = ''
as $$
  with raw as (
    select e.ord, e.value as v,
           btrim(regexp_replace(replace(replace(coalesce(e.value ->> 'text', ''),
             'GPS location pinned ✓', ''), 'GPS ಸ್ಥಳ ಪಿನ್ ಮಾಡಲಾಗಿದೆ ✓', ''), '\s+', ' ', 'g')) as txt,
           btrim(regexp_replace(coalesce(e.value ->> 'label', ''), '\s+', ' ', 'g')) as lbl,
           case when jsonb_typeof(e.value -> 'lat') = 'number' and jsonb_typeof(e.value -> 'lon') = 'number'
                then (case when (e.value ->> 'lat')::float8 between 6 and 37
                            and (e.value ->> 'lon')::float8 between 68 and 98 then true else false end)
                else false end as has_pin
      from jsonb_array_elements(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end)
           with ordinality as e(value, ord)
     where jsonb_typeof(e.value) = 'object'
  ), kept as (
    select * from raw where length(txt) >= 10 order by ord limit 3
  )
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'id', left(coalesce(nullif(regexp_replace(coalesce(v ->> 'id', ''), '[^A-Za-z0-9_-]', '', 'g'), ''), 'a' || ord::text), 40),
           'label', left(coalesce(nullif(lbl, ''), 'Address'), 30),
           'text', left(txt, 300),
           'lat', case when has_pin then round((v ->> 'lat')::numeric, 6) end,
           'lon', case when has_pin then round((v ->> 'lon')::numeric, 6) end)) order by ord), '[]'::jsonb)
    from kept
$$;

create or replace function public.customer_addresses(p_token text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_uid uuid; v_trusted boolean; v jsonb;
begin
  select c.user_id, c.trusted into v_uid, v_trusted from public.customer_session_row(p_token) c;
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'session'); end if;
  if not v_trusted then return jsonb_build_object('ok', true, 'trusted', false, 'addresses', '[]'::jsonb); end if;
  select u.addresses into v from public.users u where u.id = v_uid;
  return jsonb_build_object('ok', true, 'trusted', true, 'addresses', coalesce(v, '[]'::jsonb));
end $$;

create or replace function public.customer_save_addresses(p_token text, p_addresses jsonb)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare v_uid uuid; v_trusted boolean; v jsonb;
begin
  select c.user_id, c.trusted into v_uid, v_trusted from public.customer_session_row(p_token) c;
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'session'); end if;
  if not v_trusted then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  if jsonb_typeof(p_addresses) is distinct from 'array' or length(p_addresses::text) > 6000 then
    return jsonb_build_object('ok', false, 'error', 'bad_addresses');
  end if;
  v := public.clean_addresses(p_addresses);
  update public.users set addresses = v where id = v_uid;
  return jsonb_build_object('ok', true, 'addresses', v);
end $$;

-- ── 2. Every order needs a typed address ────────────────────────────────────
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
  -- Paid on delivery, cash or UPI, whatever the phone sends: there's no online payment yet, so an order must
  -- never look paid when nothing was paid (the delivery boy would hand it over without collecting).
  v_payment text := 'cod';
  v_gone jsonb; v_gone_db jsonb;
  v_changed jsonb; v_fresh jsonb;
  -- what the customer typed (house no., street, landmark), without the old "GPS location pinned" marker
  v_addr text := btrim(regexp_replace(replace(replace(coalesce(p_order ->> 'address', ''),
                   'GPS location pinned ✓', ''), 'GPS ಸ್ಥಳ ಪಿನ್ ಮಾಡಲಾಗಿದೆ ✓', ''), '\s+', ' ', 'g'));
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

  -- a GPS pin alone doesn't find the door: every order needs a typed address (house no., street, landmark)
  if length(v_addr) < 10 then
    return jsonb_build_object('ok', false, 'error', 'address');
  end if;

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
  values (v_id, v_uid, 'placed', v_total, v_fee, 0, v_tip, left(v_addr, 500),
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

-- ── 3. Product suggestions ──────────────────────────────────────────────────
create table if not exists public.product_suggestions (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  name text not null,
  note text,
  photo text,
  user_id uuid references public.users(id) on delete set null,
  device_hash text,
  status text not null default 'new',
  handled_at timestamptz,
  constraint product_suggestions_name_len check (length(name) between 2 and 80),
  constraint product_suggestions_note_len check (note is null or length(note) <= 300),
  constraint product_suggestions_photo_len check (photo is null or length(photo) <= 400000),
  constraint product_suggestions_status_ok check (status in ('new', 'added', 'declined'))
);
create index if not exists product_suggestions_created_idx on public.product_suggestions (created_at desc);
create index if not exists product_suggestions_device_idx on public.product_suggestions (device_hash, created_at);
-- reached only through the functions below
alter table public.product_suggestions enable row level security;
revoke all on public.product_suggestions from public, anon, authenticated;

-- A customer's suggestion: a name (2–80 characters), an optional note, an optional photo (a shrunk JPEG, PNG or WebP
-- as a data: link, about 300 KB at most). 5 a day from one phone, 200 a day from everyone.
create or replace function public.suggest_product(p_device text, p_token text, p_name text, p_note text, p_photo text)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare v_dev text; v_uid uuid; v_name text; v_note text; v_photo text := nullif(p_photo, ''); v_id bigint;
begin
  if coalesce(p_device, '') !~ '^[A-Za-z0-9_-]{16,128}$' then
    return jsonb_build_object('ok', false, 'error', 'bad_device');
  end if;
  v_dev := public.sha256_hex(p_device);
  v_name := left(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), 80);
  if length(v_name) < 2 then return jsonb_build_object('ok', false, 'error', 'name'); end if;
  v_note := nullif(left(btrim(regexp_replace(coalesce(p_note, ''), '\s+', ' ', 'g')), 300), '');
  if v_photo is not null and (length(v_photo) > 400000
       or v_photo !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$') then
    return jsonb_build_object('ok', false, 'error', 'photo');
  end if;
  if (select count(*) from public.product_suggestions s
       where s.device_hash = v_dev and s.created_at > now() - interval '1 day') >= 5 then
    return jsonb_build_object('ok', false, 'error', 'slow_down');
  end if;
  if (select count(*) from public.product_suggestions s where s.created_at > now() - interval '1 day') >= 200 then
    return jsonb_build_object('ok', false, 'error', 'busy');
  end if;
  if coalesce(p_token, '') <> '' then
    select c.user_id into v_uid from public.customer_session_row(p_token) c;
  end if;
  insert into public.product_suggestions (name, note, photo, user_id, device_hash)
  values (v_name, v_note, v_photo, v_uid, v_dev)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- Admin panel: the suggestions (newest first, without photos), one photo, mark added/declined, delete
create or replace function public.admin_suggestions(p_status text default null)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'error', 'login'); end if;
  return jsonb_build_object('ok', true,
    'new', (select count(*) from public.product_suggestions s where s.status = 'new'),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'at', x.created_at, 'name', x.name, 'note', x.note, 'has_photo', x.has_photo,
               'status', x.status, 'customer', nullif(btrim(u.name), ''), 'phone', u.phone)
               order by x.created_at desc, x.id desc)
        from (select s.id, s.created_at, s.name, s.note, s.photo is not null as has_photo, s.status, s.user_id
                from public.product_suggestions s
               where p_status is null or s.status = p_status
               order by s.created_at desc, s.id desc
               limit 300) x
        left join public.users u on u.id = x.user_id), '[]'::jsonb));
end $$;

create or replace function public.admin_suggestion_photo(p_id bigint)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v text;
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'error', 'login'); end if;
  select s.photo into v from public.product_suggestions s where s.id = p_id;
  if v is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true, 'photo', v);
end $$;

create or replace function public.admin_suggestion_set(p_id bigint, p_status text)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'error', 'login'); end if;
  if p_status is null or p_status not in ('new', 'added', 'declined') then
    return jsonb_build_object('ok', false, 'error', 'bad_status');
  end if;
  update public.product_suggestions
     set status = p_status, handled_at = case when p_status = 'new' then null else now() end
   where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_suggestion_delete(p_id bigint)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'error', 'login'); end if;
  delete from public.product_suggestions where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- ── Who may call what ───────────────────────────────────────────────────────
revoke all on function public.clean_addresses(jsonb) from public, anon, authenticated;
revoke all on function public.customer_addresses(text) from public;
revoke all on function public.customer_save_addresses(text, jsonb) from public;
revoke all on function public.suggest_product(text, text, text, text, text) from public;
revoke all on function public.admin_suggestions(text) from public;
revoke all on function public.admin_suggestion_photo(bigint) from public;
revoke all on function public.admin_suggestion_set(bigint, text) from public;
revoke all on function public.admin_suggestion_delete(bigint) from public;
grant execute on function public.customer_addresses(text) to anon, authenticated;
grant execute on function public.customer_save_addresses(text, jsonb) to anon, authenticated;
grant execute on function public.suggest_product(text, text, text, text, text) to anon, authenticated;
grant execute on function public.admin_suggestions(text) to anon, authenticated;
grant execute on function public.admin_suggestion_photo(bigint) to anon, authenticated;
grant execute on function public.admin_suggestion_set(bigint, text) to anon, authenticated;
grant execute on function public.admin_suggestion_delete(bigint) to anon, authenticated;
