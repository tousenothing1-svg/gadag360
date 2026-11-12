-- Royal Harvest: WhatsApp sign-in codes ("123456 is your verification code"), so a customer proves the phone number
-- is theirs before ordering. Stops made-up cash-on-delivery orders in someone else's name.
--
--   * The app asks the wa-code function to send a code ("send"). The function gets a fresh 6-digit code from
--     wa_code_issue (limits below), sends it with Meta's WhatsApp authentication template, and reports back with
--     wa_code_result. Only a salted hash of each code is kept.
--   * The customer types the code: customer_sign_in_code signs them in on this phone and marks the phone verified.
--   * While codes are on (wa_codes_on), only a verified phone can place an order (place_order) or sign in again
--     without a code (customer_sign_in). Codes start off: the admin turns them on in the admin panel after a test.
--   * If WhatsApp sending breaks (the last 3 tries within 15 minutes all failed), codes pause by themselves so
--     customers can still sign in and order the old way. The admin panel shows the error.
--   * app_config tells the app whether codes are on and which numbers its WhatsApp and Call buttons use.

-- ── Settings: one row, read only through the functions below ──
create table if not exists public.wa_config (
  id int primary key default 1 check (id = 1),
  phone_number_id text,                         -- Meta's id for the number that sends the codes (not a secret)
  waba_id text,                                 -- WhatsApp Business Account id (not a secret)
  template text not null default 'royal_harvest_code',
  codes_on boolean not null default false,
  help_whatsapp text default '919035068924',    -- where the app's WhatsApp buttons go; null: they become "Call us"
  help_phone text not null default '919035068924',
  last_ok_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  updated_at timestamptz not null default now()
);
insert into public.wa_config (id) values (1) on conflict do nothing;
alter table public.wa_config enable row level security;
revoke all on public.wa_config from public, anon, authenticated;

-- ── Codes sent: hashes only, kept 30 days ──
create table if not exists public.wa_codes (
  id bigint generated always as identity primary key,
  phone text not null,                 -- 10 digits
  device_hash text not null,           -- the app install that asked; only it can use the code
  ip_hash text,
  salt text not null,
  code_hash text not null,
  lang text not null default 'en',
  test boolean not null default false, -- sent from the admin panel's "Send a test code"
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  attempts int not null default 0,     -- wrong codes typed
  verified_at timestamptz,             -- right code typed
  used_at timestamptz,                 -- signed in with it
  sent_ok boolean,                     -- null while sending
  send_error text,
  wa_message_id text
);
create index if not exists wa_codes_phone on public.wa_codes (phone, created_at desc);
create index if not exists wa_codes_device on public.wa_codes (device_hash, created_at desc);
create index if not exists wa_codes_ip on public.wa_codes (ip_hash, created_at desc);
create index if not exists wa_codes_created on public.wa_codes (created_at desc);
alter table public.wa_codes enable row level security;
revoke all on public.wa_codes from public, anon, authenticated;

-- a phone that signed in with a WhatsApp code
alter table public.customer_devices add column if not exists verified_at timestamptz;

-- ── Are codes needed right now? On, a sending number set, and sending not broken ──
create or replace function public.wa_codes_on()
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce((select c.codes_on and c.phone_number_id is not null and c.waba_id is not null
                     from public.wa_config c where c.id = 1), false)
     and not coalesce((select count(*) = 3 and bool_and(not x.sent_ok)
                         from (select w.sent_ok from public.wa_codes w
                                where w.created_at > now() - interval '15 minutes' and w.sent_ok is not null and not w.test
                                order by w.created_at desc limit 3) x), false)
$$;

-- What the app needs before sign-in
create or replace function public.app_config()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('ok', true, 'codes', public.wa_codes_on(),
                            'help_whatsapp', c.help_whatsapp, 'help_phone', c.help_phone)
    from public.wa_config c where c.id = 1
$$;

-- The session's phone proved its number with a WhatsApp code
create or replace function public.customer_session_verified(p_token text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce(p_token, '') <> '' and exists (
    select 1 from public.customer_sessions s
      join public.customer_devices d on d.user_id = s.user_id and d.device_hash = s.device_hash
     where s.token_hash = public.sha256_hex(p_token) and s.expires_at > now() and d.verified_at is not null)
$$;

-- ── The sender only (wa-code function): a new code for this number, or why not ──
-- Limits keep WhatsApp costs down and stop anyone flooding a number: per number one code every 30 seconds, 5 an hour,
-- 10 a day; codes for at most 5 other numbers a day from one phone; 20 an hour from one internet address; 300 an
-- hour in all.
create or replace function public.wa_code_issue(p_phone text, p_device text, p_ip text, p_lang text, p_test boolean default false)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_phone text := public.clean_phone(p_phone);
  v_lang text := case when p_lang = 'kn' then 'kn' else 'en' end;
  v_test boolean := coalesce(p_test, false);
  v_dev text; v_ip text;
  c record;
  v_last timestamptz;
  v_code text; v_salt text; v_id bigint;
begin
  select * into c from public.wa_config where id = 1;
  if c.phone_number_id is null or c.waba_id is null then return jsonb_build_object('ok', false, 'error', 'not_set_up'); end if;
  if not v_test and not public.wa_codes_on() then return jsonb_build_object('ok', false, 'error', 'off'); end if;
  if v_phone !~ '^[6-9][0-9]{9}$' then return jsonb_build_object('ok', false, 'error', 'bad_phone'); end if;
  if coalesce(p_device, '') !~ '^[A-Za-z0-9_-]{16,128}$' then return jsonb_build_object('ok', false, 'error', 'bad_device'); end if;
  v_dev := public.sha256_hex(p_device);
  v_ip := case when coalesce(btrim(p_ip), '') = '' then null else public.sha256_hex(btrim(p_ip)) end;

  perform pg_advisory_xact_lock(hashtext('wa_code:' || v_phone)); -- two taps at once still make one code
  delete from public.wa_codes w where w.created_at < now() - interval '30 days';

  select max(w.created_at) into v_last from public.wa_codes w where w.phone = v_phone;
  if v_last > now() - interval '30 seconds' then
    return jsonb_build_object('ok', false, 'error', 'wait',
      'wait', greatest(1, ceil(extract(epoch from (v_last + interval '30 seconds' - now())))::int));
  end if;
  if (select count(*) from public.wa_codes w where w.phone = v_phone and w.created_at > now() - interval '1 hour') >= 5
     or (select count(*) from public.wa_codes w where w.phone = v_phone and w.created_at > now() - interval '1 day') >= 10
     or (select count(distinct w.phone) from public.wa_codes w
          where w.device_hash = v_dev and w.phone <> v_phone and w.created_at > now() - interval '1 day') >= 5
     or (v_ip is not null and (select count(*) from public.wa_codes w
                                where w.ip_hash = v_ip and w.created_at > now() - interval '1 hour') >= 20)
     or (select count(*) from public.wa_codes w where w.created_at > now() - interval '1 hour') >= 300 then
    return jsonb_build_object('ok', false, 'error', 'slow_down');
  end if;

  v_code := lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint % 1000000))::text, 6, '0');
  v_salt := encode(extensions.gen_random_bytes(8), 'hex');
  insert into public.wa_codes (phone, device_hash, ip_hash, salt, code_hash, lang, test, expires_at)
  values (v_phone, v_dev, v_ip, v_salt, public.sha256_hex(v_salt || v_code), v_lang, v_test, now() + interval '10 minutes')
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'code', v_code, 'to', '91' || v_phone, 'lang', v_lang,
                            'template', c.template, 'phone_number_id', c.phone_number_id);
end $$;

-- The sender reports what WhatsApp said
create or replace function public.wa_code_result(p_id bigint, p_ok boolean, p_error text default null, p_message_id text default null)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
begin
  update public.wa_codes w set sent_ok = coalesce(p_ok, false), send_error = left(p_error, 300),
         wa_message_id = left(p_message_id, 200)
   where w.id = p_id and w.sent_ok is null;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if coalesce(p_ok, false) then
    update public.wa_config set last_ok_at = now() where id = 1;
  else
    update public.wa_config set last_error = left(coalesce(nullif(p_error, ''), 'unknown'), 300), last_error_at = now() where id = 1;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ── The customer types the code from WhatsApp ──
-- Right code: signed in on this phone, which is now verified. A new customer also gives a name; without one the answer
-- is need_name and the same code works again with the name until it runs out (10 minutes). 5 wrong tries end a code.
create or replace function public.customer_sign_in_code(p_phone text, p_code text, p_name text, p_device text)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_phone text := public.clean_phone(p_phone);
  v_code text := regexp_replace(coalesce(p_code, ''), '\D', '', 'g');
  v_name text := left(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), 60);
  v_dev text;
  w record;
  v_uid uuid; v_uname text; v_email text; v_prefs jsonb;
  v_token text;
begin
  if v_phone !~ '^[6-9][0-9]{9}$' then return jsonb_build_object('ok', false, 'error', 'bad_phone'); end if;
  if coalesce(p_device, '') !~ '^[A-Za-z0-9_-]{16,128}$' then return jsonb_build_object('ok', false, 'error', 'bad_device'); end if;
  v_dev := public.sha256_hex(p_device);

  select * into w from public.wa_codes c
   where c.phone = v_phone and c.device_hash = v_dev and not c.test and c.sent_ok is distinct from false
   order by c.created_at desc limit 1
   for update;
  if w.id is null or w.used_at is not null then return jsonb_build_object('ok', false, 'error', 'no_code'); end if;
  if w.expires_at <= now() then return jsonb_build_object('ok', false, 'error', 'expired'); end if;
  if w.attempts >= 5 then return jsonb_build_object('ok', false, 'error', 'too_many'); end if;
  if v_code !~ '^[0-9]{6}$' or public.sha256_hex(w.salt || v_code) <> w.code_hash then
    update public.wa_codes c set attempts = c.attempts + 1 where c.id = w.id;
    return jsonb_build_object('ok', false, 'error', case when w.attempts + 1 >= 5 then 'too_many' else 'wrong_code' end,
                              'tries_left', greatest(0, 4 - w.attempts));
  end if;
  update public.wa_codes c set verified_at = coalesce(c.verified_at, now()) where c.id = w.id;

  select u.id, u.name, u.email, u.prefs into v_uid, v_uname, v_email, v_prefs from public.users u where u.phone = v_phone;
  if v_uid is null then
    if v_name = '' then return jsonb_build_object('ok', false, 'error', 'need_name'); end if;
    insert into public.users (phone, name) values (v_phone, v_name)
    on conflict (phone) do nothing
    returning id, name, email, prefs into v_uid, v_uname, v_email, v_prefs;
    if v_uid is null then -- signed up a moment ago from somewhere else
      select u.id, u.name, u.email, u.prefs into v_uid, v_uname, v_email, v_prefs from public.users u where u.phone = v_phone;
    end if;
  elsif coalesce(v_uname, '') = '' and v_name <> '' then
    update public.users set name = v_name where id = v_uid;
    v_uname := v_name;
  end if;

  update public.wa_codes c set used_at = now() where c.id = w.id;
  insert into public.customer_devices (user_id, device_hash, trusted, verified_at)
  values (v_uid, v_dev, true, now())
  on conflict (user_id, device_hash) do update set trusted = true, verified_at = now(), last_seen_at = now();

  v_token := public.new_token();
  insert into public.customer_sessions (token_hash, user_id, device_hash, expires_at)
  values (public.sha256_hex(v_token), v_uid, v_dev, now() + interval '365 days');
  return jsonb_build_object('ok', true, 'token', v_token, 'trusted', true, 'verified', true,
                            'name', coalesce(v_uname, ''), 'email', coalesce(v_email, ''), 'prefs', v_prefs);
end $$;

-- ── The session says whether this phone is verified (the app asks for a code before ordering if not) ──
create or replace function public.customer_session(p_token text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_uid uuid; v_trusted boolean; v_name text; v_email text; v_prefs jsonb; v_coins int;
  v_verified boolean := public.customer_session_verified(p_token);
begin
  select c.user_id, c.trusted into v_uid, v_trusted from public.customer_session_row(p_token) c;
  if v_uid is null then return jsonb_build_object('ok', false); end if;
  if not v_trusted then return jsonb_build_object('ok', true, 'trusted', false, 'verified', false); end if;
  select u.name, u.email, u.prefs, u.coins into v_name, v_email, v_prefs, v_coins
    from public.users u where u.id = v_uid;
  return jsonb_build_object('ok', true, 'trusted', true, 'verified', v_verified, 'name', coalesce(v_name, ''),
    'email', coalesce(v_email, ''), 'prefs', v_prefs, 'coins', coalesce(v_coins, 0));
end $$;

-- ── Admin panel: settings and how sending is going ──
create or replace function public.admin_wa_status(p_token text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare c record;
begin
  if public.staff_subject(p_token, 'admin') is null then return jsonb_build_object('ok', false, 'error', 'login'); end if;
  select * into c from public.wa_config where id = 1;
  return jsonb_build_object('ok', true,
    'phone_number_id', c.phone_number_id, 'waba_id', c.waba_id, 'template', c.template,
    'codes_on', c.codes_on, 'working', public.wa_codes_on(),
    'help_whatsapp', c.help_whatsapp, 'help_phone', c.help_phone,
    'last_ok_at', c.last_ok_at, 'last_error', c.last_error, 'last_error_at', c.last_error_at,
    'sent_24h', (select count(*) from public.wa_codes w where w.created_at > now() - interval '1 day' and w.sent_ok and not w.test),
    'failed_24h', (select count(*) from public.wa_codes w where w.created_at > now() - interval '1 day' and w.sent_ok = false and not w.test),
    'signed_in_24h', (select count(*) from public.wa_codes w where w.used_at > now() - interval '1 day'));
end $$;

-- Change any of: phone_number_id, waba_id, help_whatsapp (empty: none), help_phone, codes_on.
-- Codes go on only after one code was sent successfully (the admin panel's "Send a test code").
create or replace function public.admin_wa_save(p_token text, p_settings jsonb)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  s jsonb := coalesce(p_settings, '{}'::jsonb);
  v_pid text := nullif(btrim(coalesce(s ->> 'phone_number_id', '')), '');
  v_waba text := nullif(btrim(coalesce(s ->> 'waba_id', '')), '');
  v_help text := nullif(right(regexp_replace(coalesce(s ->> 'help_whatsapp', ''), '\D', '', 'g'), 10), '');
  v_call text := nullif(right(regexp_replace(coalesce(s ->> 'help_phone', ''), '\D', '', 'g'), 10), '');
  v_on boolean;
  c record;
begin
  if public.staff_subject(p_token, 'admin') is null then return jsonb_build_object('ok', false, 'error', 'login'); end if;
  if (v_pid is not null and v_pid !~ '^[0-9]{5,30}$') or (v_waba is not null and v_waba !~ '^[0-9]{5,30}$') then
    return jsonb_build_object('ok', false, 'error', 'bad_id');
  end if;
  if (v_help is not null and v_help !~ '^[6-9][0-9]{9}$') or (s ? 'help_phone' and coalesce(v_call, '') !~ '^[6-9][0-9]{9}$') then
    return jsonb_build_object('ok', false, 'error', 'bad_phone');
  end if;
  if s ? 'codes_on' then
    if jsonb_typeof(s -> 'codes_on') <> 'boolean' then return jsonb_build_object('ok', false, 'error', 'bad_value'); end if;
    v_on := (s ->> 'codes_on')::boolean;
  end if;

  update public.wa_config set
    phone_number_id = case when s ? 'phone_number_id' then v_pid else phone_number_id end,
    waba_id = case when s ? 'waba_id' then v_waba else waba_id end,
    help_whatsapp = case when s ? 'help_whatsapp' then case when v_help is null then null else '91' || v_help end else help_whatsapp end,
    help_phone = case when s ? 'help_phone' then '91' || v_call else help_phone end,
    last_error = case when s ? 'phone_number_id' or s ? 'waba_id' then null else last_error end,
    last_error_at = case when s ? 'phone_number_id' or s ? 'waba_id' then null else last_error_at end,
    updated_at = now()
   where id = 1;

  if v_on is not null then
    select * into c from public.wa_config where id = 1;
    if v_on and (c.phone_number_id is null or c.waba_id is null) then
      return jsonb_build_object('ok', false, 'error', 'not_set_up');
    end if;
    if v_on and c.last_ok_at is null then
      return jsonb_build_object('ok', false, 'error', 'test_first');
    end if;
    update public.wa_config set codes_on = v_on, updated_at = now() where id = 1;
  end if;
  return public.admin_wa_status(p_token);
end $$;

-- ── Sign-in without a code: as in security_1_functions.sql, plus the WhatsApp codes check ──
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

  -- WhatsApp codes on: without a code, only a phone that already proved this number can sign in
  if public.wa_codes_on() and not exists (
       select 1 from public.users u join public.customer_devices d on d.user_id = u.id
        where u.phone = v_phone and d.device_hash = v_dev and d.verified_at is not null) then
    return jsonb_build_object('ok', false, 'error', 'code_required');
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

-- ── Placing an order: as in 17_min_order.sql, plus the WhatsApp codes check ──
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

  -- the smallest order the shop takes: ₹50 of items (before the delivery fee and tip)
  if v_sub < 50 then
    return jsonb_build_object('ok', false, 'error', 'min_order', 'min', 50);
  end if;

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

  -- WhatsApp codes on: only a phone that proved its number with a code can order
  if public.wa_codes_on() and not public.customer_session_verified(p_token) then
    return jsonb_build_object('ok', false, 'error', 'verify');
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

revoke execute on function public.wa_codes_on() from public, anon, authenticated;
revoke execute on function public.customer_session_verified(text) from public, anon, authenticated;
revoke execute on function public.wa_code_issue(text, text, text, text, boolean) from public, anon, authenticated;
revoke execute on function public.wa_code_result(bigint, boolean, text, text) from public, anon, authenticated;
revoke execute on function public.app_config() from public;
revoke execute on function public.customer_sign_in_code(text, text, text, text) from public;
revoke execute on function public.admin_wa_status(text) from public;
revoke execute on function public.admin_wa_save(text, jsonb) from public;
grant execute on function public.app_config() to anon, authenticated;
grant execute on function public.customer_sign_in_code(text, text, text, text) to anon, authenticated;
grant execute on function public.admin_wa_status(text) to anon, authenticated;
grant execute on function public.admin_wa_save(text, jsonb) to anon, authenticated;
grant execute on function public.wa_code_issue(text, text, text, text, boolean) to service_role;
grant execute on function public.wa_code_result(bigint, boolean, text, text) to service_role;
grant execute on function public.wa_codes_on() to service_role;
