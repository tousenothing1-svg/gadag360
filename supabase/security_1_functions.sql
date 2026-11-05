-- Royal Harvest: customer data security, part 1 of 2.
-- Adds private tables, login sessions and the functions the customer app, the
-- admin panel and the rider panel call. Nothing here removes the old open table
-- access; part 2 (security_2_lockdown.sql) does that once the new apps are live.
--
-- How access works after part 2:
--   * Customers never read or write tables directly. They call the functions
--     below with a random device id (kept on the phone) and a session token.
--   * Riders log in with phone + password (bcrypt, checked in the database) and
--     call rider_* functions with their session token.
--   * The admin logs in the same way; the admin panel sends the token in an
--     "x-staff-token" header and row-level security lets only that token through.

-- ── Helpers ───────────────────────────────────────────────────────────────
create or replace function public.sha256_hex(t text)
returns text language sql immutable strict set search_path = ''
as $$ select encode(extensions.digest(convert_to(t, 'UTF8'), 'sha256'), 'hex') $$;

create or replace function public.new_token()
returns text language sql volatile set search_path = ''
as $$ select encode(extensions.gen_random_bytes(32), 'hex') $$;

-- last 10 digits, so "+91 98765 43210" and "9876543210" match
create or replace function public.clean_phone(p text)
returns text language sql immutable set search_path = ''
as $$ select right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 10) $$;

create or replace function public.request_staff_token()
returns text language sql stable set search_path = ''
as $$ select nullif(nullif(current_setting('request.headers', true), '')::json ->> 'x-staff-token', '') $$;

-- ── Private tables (no policies: only the functions below can use them) ──
create table if not exists public.admins (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null unique,
  pass_hash text not null,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_setup_codes (
  code_hash text primary key,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create table if not exists public.rider_credentials (
  rider_id text primary key,
  pass_hash text not null,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.staff_sessions (
  token_hash text primary key,
  kind text not null check (kind in ('admin', 'rider')),
  subject_id text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists staff_sessions_subject on public.staff_sessions (kind, subject_id);

create table if not exists public.customer_devices (
  user_id uuid not null references public.users (id) on delete cascade,
  device_hash text not null,
  trusted boolean not null default false,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (user_id, device_hash)
);

create table if not exists public.customer_sessions (
  token_hash text primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  device_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists customer_sessions_user on public.customer_sessions (user_id, created_at);
create index if not exists customer_sessions_device on public.customer_sessions (device_hash, created_at);

alter table public.admins enable row level security;
alter table public.admin_setup_codes enable row level security;
alter table public.rider_credentials enable row level security;
alter table public.staff_sessions enable row level security;
alter table public.customer_devices enable row level security;
alter table public.customer_sessions enable row level security;
revoke all on table public.admins, public.admin_setup_codes, public.rider_credentials,
  public.staff_sessions, public.customer_devices, public.customer_sessions from anon, authenticated;

-- ── New columns ──────────────────────────────────────────────────────────
alter table public.orders add column if not exists device_hash text;       -- sha256 of the phone's device id
alter table public.orders add column if not exists coins_earned int not null default 0;
alter table public.orders add column if not exists coins_revoked boolean not null default false;
alter table public.orders add column if not exists tip int not null default 0;
alter table public.order_items add column if not exists db_product_id text; -- products.id the stock came from
alter table public.order_items add column if not exists position int;
create index if not exists orders_device on public.orders (device_hash);
create index if not exists orders_user on public.orders (user_id, created_at desc);
create index if not exists orders_rider on public.orders (delivery_boy_id, created_at desc);
create index if not exists order_items_order on public.order_items (order_id);

-- ── Staff sessions ───────────────────────────────────────────────────────
create or replace function public.staff_subject(p_token text, p_kind text)
returns text language sql stable security definer set search_path = ''
as $$
  select s.subject_id
    from public.staff_sessions s
   where s.token_hash = public.sha256_hex(p_token)
     and s.kind = p_kind
     and s.expires_at > now()
     and case p_kind
           when 'admin' then exists (select 1 from public.admins a where a.id::text = s.subject_id)
           when 'rider' then exists (select 1 from public.delivery_boys d
                                      where d.id = s.subject_id and coalesce(d.active, true))
           else false
         end
$$;

-- used by row-level security: true only when the request carries a live admin token
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select public.staff_subject(public.request_staff_token(), 'admin') is not null $$;

create or replace function public.staff_login(p_phone text, p_password text, p_kind text)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_phone text := public.clean_phone(p_phone);
  v_id text; v_name text; v_hash text; v_locked timestamptz; v_fails int := 0;
  v_token text;
begin
  if p_kind is null or p_kind not in ('admin', 'rider') then
    return jsonb_build_object('ok', false, 'error', 'bad_kind');
  end if;

  if p_kind = 'admin' then
    select a.id::text, a.name, a.pass_hash, a.locked_until, a.failed_attempts
      into v_id, v_name, v_hash, v_locked, v_fails
      from public.admins a
     where public.clean_phone(a.phone) = v_phone
     order by a.created_at limit 1;
  else
    select d.id, d.name, c.pass_hash, c.locked_until, c.failed_attempts
      into v_id, v_name, v_hash, v_locked, v_fails
      from public.delivery_boys d join public.rider_credentials c on c.rider_id = d.id
     where public.clean_phone(d.phone) = v_phone and coalesce(d.active, true)
     order by d.created_at limit 1;
  end if;

  if v_id is not null and v_locked is not null then
    if v_locked > now() then
      return jsonb_build_object('ok', false, 'error', 'locked');
    end if;
    v_fails := 0; -- the lock ran out: count again from zero
  end if;

  if v_hash is null or p_password is null or length(p_password) > 200
     or extensions.crypt(p_password, v_hash) <> v_hash then
    if v_hash is null then -- same amount of work when the number isn't known
      perform extensions.crypt(coalesce(p_password, ''), extensions.gen_salt('bf', 10));
    end if;
    if v_id is not null then
      if p_kind = 'admin' then
        update public.admins
           set failed_attempts = v_fails + 1,
               locked_until = case when v_fails + 1 >= 10 then now() + interval '15 minutes' end
         where id::text = v_id;
      else
        update public.rider_credentials
           set failed_attempts = v_fails + 1,
               locked_until = case when v_fails + 1 >= 10 then now() + interval '15 minutes' end
         where rider_id = v_id;
      end if;
    end if;
    return jsonb_build_object('ok', false, 'error', 'invalid_login');
  end if;

  if p_kind = 'admin' then
    update public.admins set failed_attempts = 0, locked_until = null where id::text = v_id;
  else
    update public.rider_credentials set failed_attempts = 0, locked_until = null where rider_id = v_id;
  end if;
  delete from public.staff_sessions where expires_at < now();
  v_token := public.new_token();
  insert into public.staff_sessions (token_hash, kind, subject_id, expires_at)
  values (public.sha256_hex(v_token), p_kind, v_id,
          now() + case when p_kind = 'admin' then interval '7 days' else interval '30 days' end);
  return jsonb_build_object('ok', true, 'token', v_token, 'kind', p_kind, 'id', v_id, 'name', v_name);
end $$;

create or replace function public.staff_logout(p_token text)
returns jsonb language sql volatile security definer set search_path = ''
as $$
  delete from public.staff_sessions where token_hash = public.sha256_hex(p_token);
  select jsonb_build_object('ok', true);
$$;

create or replace function public.staff_me(p_token text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_kind text; v_id text; v_name text;
begin
  select s.kind, s.subject_id into v_kind, v_id
    from public.staff_sessions s
   where s.token_hash = public.sha256_hex(p_token) and s.expires_at > now();
  if v_id is null or public.staff_subject(p_token, v_kind) is null then
    return jsonb_build_object('ok', false);
  end if;
  if v_kind = 'admin' then
    select a.name into v_name from public.admins a where a.id::text = v_id;
  else
    select d.name into v_name from public.delivery_boys d where d.id = v_id;
  end if;
  return jsonb_build_object('ok', true, 'kind', v_kind, 'id', v_id, 'name', v_name);
end $$;

create or replace function public.admin_exists()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.admins) $$;

-- First admin account: needs a one-time setup code (only its hash is stored).
create or replace function public.admin_setup(p_code text, p_name text, p_phone text, p_password text)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_code text := regexp_replace(upper(coalesce(p_code, '')), '[^A-Z0-9]', '', 'g');
  v_name text := left(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), 60);
  v_phone text := public.clean_phone(p_phone);
  v_id uuid;
  v_token text;
begin
  if not exists (select 1 from public.admin_setup_codes c
                  where c.code_hash = public.sha256_hex(v_code) and c.used_at is null and c.expires_at > now()) then
    return jsonb_build_object('ok', false, 'error', 'bad_code');
  end if;
  if v_phone !~ '^[6-9][0-9]{9}$' then return jsonb_build_object('ok', false, 'error', 'bad_phone'); end if;
  if length(v_name) < 2 then return jsonb_build_object('ok', false, 'error', 'bad_name'); end if;
  if p_password is null or length(p_password) < 8 or length(p_password) > 200 then
    return jsonb_build_object('ok', false, 'error', 'weak_password');
  end if;
  if exists (select 1 from public.admins a where public.clean_phone(a.phone) = v_phone) then
    return jsonb_build_object('ok', false, 'error', 'phone_taken');
  end if;
  update public.admin_setup_codes set used_at = now()
   where code_hash = public.sha256_hex(v_code) and used_at is null and expires_at > now();
  if not found then return jsonb_build_object('ok', false, 'error', 'bad_code'); end if;

  insert into public.admins (name, phone, pass_hash)
  values (v_name, v_phone, extensions.crypt(p_password, extensions.gen_salt('bf', 10)))
  returning id into v_id;
  v_token := public.new_token();
  insert into public.staff_sessions (token_hash, kind, subject_id, expires_at)
  values (public.sha256_hex(v_token), 'admin', v_id::text, now() + interval '7 days');
  return jsonb_build_object('ok', true, 'token', v_token, 'kind', 'admin', 'id', v_id, 'name', v_name);
end $$;

create or replace function public.staff_change_password(p_token text, p_old text, p_new text)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare v_kind text; v_id text; v_hash text;
begin
  select s.kind, s.subject_id into v_kind, v_id
    from public.staff_sessions s
   where s.token_hash = public.sha256_hex(p_token) and s.expires_at > now();
  if v_id is null or public.staff_subject(p_token, v_kind) is null then
    return jsonb_build_object('ok', false, 'error', 'session');
  end if;
  if p_new is null or length(p_new) < 8 or length(p_new) > 200 then
    return jsonb_build_object('ok', false, 'error', 'weak_password');
  end if;
  if v_kind = 'admin' then
    select a.pass_hash into v_hash from public.admins a where a.id::text = v_id;
  else
    select c.pass_hash into v_hash from public.rider_credentials c where c.rider_id = v_id;
  end if;
  if v_hash is null or p_old is null or extensions.crypt(p_old, v_hash) <> v_hash then
    return jsonb_build_object('ok', false, 'error', 'wrong_password');
  end if;
  if v_kind = 'admin' then
    update public.admins set pass_hash = extensions.crypt(p_new, extensions.gen_salt('bf', 10)) where id::text = v_id;
  else
    update public.rider_credentials set pass_hash = extensions.crypt(p_new, extensions.gen_salt('bf', 10)), updated_at = now()
     where rider_id = v_id;
  end if;
  -- sign out every other device of this person
  delete from public.staff_sessions
   where kind = v_kind and subject_id = v_id and token_hash <> public.sha256_hex(p_token);
  return jsonb_build_object('ok', true);
end $$;

-- ── Rider passwords: stored only as bcrypt hashes in rider_credentials ──
-- The admin panel still writes a "password" field; this trigger hashes it.
-- (Part 2 also blanks the plaintext column.)
create or replace function public.delivery_boys_password_hash()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.password is not distinct from old.password then return new; end if;
  end if;
  if new.password is not null and new.password <> '' then
    insert into public.rider_credentials (rider_id, pass_hash)
    values (new.id, extensions.crypt(new.password, extensions.gen_salt('bf', 10)))
    on conflict (rider_id) do update
      set pass_hash = excluded.pass_hash, failed_attempts = 0, locked_until = null, updated_at = now();
    delete from public.staff_sessions where kind = 'rider' and subject_id = new.id; -- new password: sign out everywhere
  end if;
  return new;
end $$;

drop trigger if exists delivery_boys_password_hash on public.delivery_boys;
create trigger delivery_boys_password_hash before insert or update on public.delivery_boys
  for each row execute function public.delivery_boys_password_hash();

create or replace function public.delivery_boys_cleanup()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.rider_credentials where rider_id = old.id;
  delete from public.staff_sessions where kind = 'rider' and subject_id = old.id;
  return old;
end $$;

drop trigger if exists delivery_boys_cleanup on public.delivery_boys;
create trigger delivery_boys_cleanup after delete on public.delivery_boys
  for each row execute function public.delivery_boys_cleanup();

insert into public.rider_credentials (rider_id, pass_hash)
select d.id, extensions.crypt(d.password, extensions.gen_salt('bf', 10))
  from public.delivery_boys d
 where d.password is not null and d.password <> ''
on conflict (rider_id) do nothing;

-- ── Coins come back off the account when an order is cancelled (by anyone) ──
create or replace function public.orders_revoke_coins()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled'
     and not new.coins_revoked and new.coins_earned > 0 and new.user_id is not null then
    update public.users set coins = greatest(0, coalesce(coins, 0) - new.coins_earned) where id = new.user_id;
    new.coins_revoked := true;
  end if;
  return new;
end $$;

drop trigger if exists orders_revoke_coins on public.orders;
create trigger orders_revoke_coins before update of status on public.orders
  for each row execute function public.orders_revoke_coins();

-- ── Customers ─────────────────────────────────────────────────────────────
-- A session belongs to one account on one device. A device is "trusted" for an
-- account when it created the account (or proved it was already signed in
-- before this change). Until OTP arrives, anyone can type any phone number, so
-- an untrusted device sees only orders it placed itself, never the saved name,
-- email, preferences, coin balance or other orders.
create or replace function public.customer_session_row(p_token text)
returns table (user_id uuid, device_hash text, trusted boolean)
language sql stable security definer set search_path = ''
as $$
  select s.user_id, s.device_hash, coalesce(d.trusted, false)
    from public.customer_sessions s
    left join public.customer_devices d on d.user_id = s.user_id and d.device_hash = s.device_hash
   where s.token_hash = public.sha256_hex(p_token) and s.expires_at > now()
$$;

create or replace function public.customer_sign_in(p_phone text, p_name text, p_device text, p_legacy_id text default null)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_phone text := public.clean_phone(p_phone);
  v_name text := left(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), 60);
  v_dev text;
  v_uid uuid; v_uname text; v_email text; v_prefs jsonb; v_coins int;
  v_new boolean := false;
  v_known boolean;
  v_trusted boolean := false;
  v_token text;
begin
  if v_phone !~ '^[6-9][0-9]{9}$' then return jsonb_build_object('ok', false, 'error', 'bad_phone'); end if;
  if coalesce(p_device, '') !~ '^[A-Za-z0-9_-]{16,128}$' then
    return jsonb_build_object('ok', false, 'error', 'bad_device');
  end if;
  v_dev := public.sha256_hex(p_device);

  if (select count(*) from public.customer_sessions s
       where s.device_hash = v_dev and s.created_at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('ok', false, 'error', 'slow_down');
  end if;

  select u.id, u.name, u.email, u.prefs, u.coins into v_uid, v_uname, v_email, v_prefs, v_coins
    from public.users u where u.phone = v_phone;
  if v_uid is null then
    if v_name = '' then return jsonb_build_object('ok', false, 'error', 'bad_name'); end if;
    insert into public.users (phone, name, coins) values (v_phone, v_name, 120)
    on conflict (phone) do nothing
    returning id, name, email, prefs, coins into v_uid, v_uname, v_email, v_prefs, v_coins;
    if v_uid is not null then
      v_new := true;
    else -- signed up a moment ago from somewhere else
      select u.id, u.name, u.email, u.prefs, u.coins into v_uid, v_uname, v_email, v_prefs, v_coins
        from public.users u where u.phone = v_phone;
    end if;
  end if;

  if v_new then
    v_trusted := true;
  else
    select d.trusted into v_known from public.customer_devices d
     where d.user_id = v_uid and d.device_hash = v_dev;
    v_trusted := coalesce(v_known, false);
    -- phones already signed in before this change still know their account id
    if not v_trusted and p_legacy_id is not null and p_legacy_id = v_uid::text
       and now() < timestamptz '2027-01-01 00:00:00+00' then
      v_trusted := true;
    end if;
    if not v_trusted and (select count(*) from public.customer_sessions s
                           where s.user_id = v_uid and s.created_at > now() - interval '1 hour') >= 20 then
      return jsonb_build_object('ok', false, 'error', 'slow_down');
    end if;
  end if;

  insert into public.customer_devices (user_id, device_hash, trusted)
  values (v_uid, v_dev, v_trusted)
  on conflict (user_id, device_hash) do update
    set trusted = public.customer_devices.trusted or excluded.trusted, last_seen_at = now();

  if v_trusted and coalesce(v_uname, '') = '' and v_name <> '' then
    update public.users set name = v_name where id = v_uid;
    v_uname := v_name;
  end if;

  v_token := public.new_token();
  insert into public.customer_sessions (token_hash, user_id, device_hash, expires_at)
  values (public.sha256_hex(v_token), v_uid, v_dev, now() + interval '365 days');

  if v_trusted then
    return jsonb_build_object('ok', true, 'token', v_token, 'trusted', true,
      'name', coalesce(v_uname, ''), 'email', coalesce(v_email, ''), 'prefs', v_prefs, 'coins', coalesce(v_coins, 0));
  end if;
  return jsonb_build_object('ok', true, 'token', v_token, 'trusted', false,
    'name', '', 'email', '', 'prefs', null, 'coins', null);
end $$;

create or replace function public.customer_session(p_token text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_uid uuid; v_trusted boolean; v_name text; v_email text; v_prefs jsonb; v_coins int;
begin
  select c.user_id, c.trusted into v_uid, v_trusted from public.customer_session_row(p_token) c;
  if v_uid is null then return jsonb_build_object('ok', false); end if;
  if not v_trusted then return jsonb_build_object('ok', true, 'trusted', false); end if;
  select u.name, u.email, u.prefs, u.coins into v_name, v_email, v_prefs, v_coins
    from public.users u where u.id = v_uid;
  return jsonb_build_object('ok', true, 'trusted', true, 'name', coalesce(v_name, ''),
    'email', coalesce(v_email, ''), 'prefs', v_prefs, 'coins', coalesce(v_coins, 0));
end $$;

create or replace function public.customer_orders(p_token text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_uid uuid; v_dev text; v_trusted boolean;
begin
  select c.user_id, c.device_hash, c.trusted into v_uid, v_dev, v_trusted
    from public.customer_session_row(p_token) c;
  if v_uid is null then return jsonb_build_object('ok', false, 'orders', '[]'::jsonb); end if;
  return jsonb_build_object('ok', true, 'orders', coalesce((
    select jsonb_agg(x.j order by x.created_at desc)
      from (select o.created_at, jsonb_build_object(
                     'id', o.id, 'status', o.status, 'total', o.total, 'address', o.address,
                     'payment', o.payment, 'delivery_slot', o.delivery_slot,
                     'created_at', o.created_at at time zone 'UTC', 'coins_earned', o.coins_earned,
                     'items', coalesce((select jsonb_agg(jsonb_build_object(
                                 'product_id', i.product_id, 'product_name', i.product_name,
                                 'quantity', i.quantity, 'price', i.price, 'variant', i.variant)
                                 order by i.position nulls last, i.created_at, i.id)
                               from public.order_items i where i.order_id = o.id), '[]'::jsonb)) as j
              from public.orders o
             where o.user_id = v_uid and (v_trusted or o.device_hash = v_dev)
             order by o.created_at desc
             limit 100) x), '[]'::jsonb));
end $$;

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

  -- the same order sent again (a retry after a dropped connection) is fine
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

  -- the bill, same rules as the app: ₹15 delivery under ₹250, ₹20 off from ₹299,
  -- 1 coin per ₹10 on the goods (not the tip)
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

  -- take the items off the shelf; a count of 0 or none restarts at 100, as the app always did
  update public.products p
     set stock_qty = greatest(0, coalesce(nullif(p.stock_qty, 0), 100) - q.qty),
         in_stock = greatest(0, coalesce(nullif(p.stock_qty, 0), 100) - q.qty) > 0
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

-- live status for the tracking screen: only orders placed from this device
create or replace function public.order_status(p_device text, p_ids text[])
returns jsonb language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', o.id, 'status', o.status,
           'rider_lat', case when o.status in ('pickedup', 'picked_up') then o.rider_lat end,
           'rider_lon', case when o.status in ('pickedup', 'picked_up') then o.rider_lon end,
           'rider_updated_at', case when o.status in ('pickedup', 'picked_up') then o.rider_updated_at end)),
         '[]'::jsonb)
    from public.orders o
   where coalesce(p_device, '') ~ '^[A-Za-z0-9_-]{16,128}$'
     and o.device_hash = public.sha256_hex(p_device)
     and o.id = any (p_ids[1:10])
$$;

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
  update public.products p
     set stock_qty = coalesce(p.stock_qty, 0) + q.qty,
         in_stock = coalesce(p.stock_qty, 0) + q.qty > 0
    from (select i.db_product_id as pid, sum(i.quantity) as qty
            from public.order_items i
           where i.order_id = p_id and i.db_product_id is not null
           group by 1) q
   where p.id = q.pid;
  return jsonb_build_object('ok', true, 'status', 'cancelled');
end $$;

create or replace function public.customer_update_profile(p_token text, p_name text, p_email text)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid uuid; v_trusted boolean;
  v_name text := left(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), 60);
  v_email text := btrim(coalesce(p_email, ''));
begin
  select c.user_id, c.trusted into v_uid, v_trusted from public.customer_session_row(p_token) c;
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'session'); end if;
  if not v_trusted then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  if v_name = '' then return jsonb_build_object('ok', false, 'error', 'bad_name'); end if;
  if v_email <> '' and (length(v_email) > 120 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
    return jsonb_build_object('ok', false, 'error', 'bad_email');
  end if;
  update public.users set name = v_name, email = nullif(v_email, '') where id = v_uid;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.customer_save_prefs(p_token text, p_prefs jsonb)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare v_uid uuid; v_trusted boolean;
begin
  select c.user_id, c.trusted into v_uid, v_trusted from public.customer_session_row(p_token) c;
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'session'); end if;
  if not v_trusted then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  if jsonb_typeof(p_prefs) is distinct from 'object' or length(p_prefs::text) > 2000 then
    return jsonb_build_object('ok', false, 'error', 'bad_prefs');
  end if;
  update public.users set prefs = p_prefs where id = v_uid;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.customer_sign_out(p_token text)
returns jsonb language sql volatile security definer set search_path = ''
as $$
  delete from public.customer_sessions where token_hash = public.sha256_hex(p_token);
  select jsonb_build_object('ok', true);
$$;

-- ── Riders ───────────────────────────────────────────────────────────────
create or replace function public.rider_orders(p_token text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_rid text := public.staff_subject(p_token, 'rider');
begin
  if v_rid is null then return jsonb_build_object('ok', false, 'error', 'session'); end if;
  return jsonb_build_object('ok', true, 'orders', coalesce((
    select jsonb_agg(x.j order by x.created_at desc)
      from (select o.created_at, jsonb_build_object(
                     'id', o.id, 'status', o.status, 'total', o.total, 'delivery_fee', o.delivery_fee,
                     'payment', o.payment, 'delivery_slot', o.delivery_slot, 'address', o.address,
                     'gps_lat', o.gps_lat, 'gps_lon', o.gps_lon, 'created_at', o.created_at at time zone 'UTC',
                     'order_items', coalesce((select jsonb_agg(jsonb_build_object(
                                       'product_name', i.product_name, 'quantity', i.quantity,
                                       'price', i.price, 'variant', i.variant)
                                       order by i.position nulls last, i.created_at, i.id)
                                     from public.order_items i where i.order_id = o.id), '[]'::jsonb)) as j
              from public.orders o
             where o.delivery_boy_id = v_rid
               and o.status is distinct from 'cancelled'
               and (o.status is distinct from 'delivered'
                    or o.created_at > (now() at time zone 'UTC') - interval '30 days')
             order by o.created_at desc
             limit 200) x), '[]'::jsonb));
end $$;

create or replace function public.rider_set_status(p_token text, p_id text, p_status text)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare v_rid text := public.staff_subject(p_token, 'rider'); v_status text;
begin
  if v_rid is null then return jsonb_build_object('ok', false, 'error', 'session'); end if;
  select o.status into v_status
    from public.orders o where o.id = p_id and o.delivery_boy_id = v_rid
     for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_status = p_status then return jsonb_build_object('ok', true, 'status', v_status); end if;
  if (p_status = 'pickedup' and v_status in ('placed', 'confirmed'))
     or (p_status = 'delivered' and v_status in ('pickedup', 'picked_up')) then
    update public.orders set status = p_status where id = p_id;
    return jsonb_build_object('ok', true, 'status', p_status);
  end if;
  return jsonb_build_object('ok', false, 'error', 'bad_status', 'status', v_status);
end $$;

create or replace function public.rider_set_location(p_token text, p_id text, p_lat float8, p_lon float8)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare v_rid text := public.staff_subject(p_token, 'rider');
begin
  if v_rid is null then return jsonb_build_object('ok', false, 'error', 'session'); end if;
  if p_lat is null or p_lon is null or p_lat not between -90 and 90 or p_lon not between -180 and 180 then
    return jsonb_build_object('ok', false, 'error', 'bad_location');
  end if;
  update public.orders
     set rider_lat = p_lat, rider_lon = p_lon, rider_updated_at = now()
   where id = p_id and delivery_boy_id = v_rid and status in ('pickedup', 'picked_up');
  return jsonb_build_object('ok', found);
end $$;

-- ── Who may call what ────────────────────────────────────────────────────
revoke all on function
  public.sha256_hex(text), public.new_token(), public.clean_phone(text), public.request_staff_token(),
  public.staff_subject(text, text), public.customer_session_row(text)
  from public, anon, authenticated;

grant execute on function public.is_admin() to anon, authenticated;
grant execute on function
  public.customer_sign_in(text, text, text, text), public.customer_session(text), public.customer_orders(text),
  public.place_order(text, text, jsonb), public.order_status(text, text[]), public.cancel_order(text, text),
  public.customer_update_profile(text, text, text), public.customer_save_prefs(text, jsonb),
  public.customer_sign_out(text),
  public.staff_login(text, text, text), public.staff_logout(text), public.staff_me(text), public.admin_exists(),
  public.admin_setup(text, text, text, text), public.staff_change_password(text, text, text),
  public.rider_orders(text), public.rider_set_status(text, text, text), public.rider_set_location(text, text, float8, float8)
  to anon, authenticated;
