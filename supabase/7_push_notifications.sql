-- Royal Harvest: alerts (web push notifications) for fresh arrivals, price drops and offers.
--
-- A customer taps "Turn on alerts" in the app; the browser gives the phone a private push address (endpoint + keys)
-- and push_subscribe() keeps it here. The admin writes a notification in the admin panel; the send-push function
-- (supabase/functions/send-push) checks the admin, saves it in push_messages and delivers it to every address,
-- encrypted for each phone. Addresses the phone's push service says are gone get removed.

create table if not exists public.push_subscriptions (
  id bigint generated always as identity primary key,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device_hash text not null,
  user_id uuid references public.users(id) on delete set null,
  lang text not null default 'en' check (lang in ('en', 'kn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_device on public.push_subscriptions (device_hash);
create index if not exists push_subscriptions_user on public.push_subscriptions (user_id);
-- private push addresses: nobody reads them over the API; only the sender (service key) and the functions below
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

create table if not exists public.push_messages (
  id bigint generated always as identity primary key,
  kind text not null default 'other' check (kind in ('fresh', 'price', 'offer', 'other')),
  title text not null check (char_length(title) between 1 and 80),
  body text not null check (char_length(body) between 1 and 240),
  title_kn text check (char_length(title_kn) <= 80),
  body_kn text check (char_length(body_kn) <= 240),
  url text not null default '/' check (url = '/' or url ~ '^/[^/\\]'),  -- always a page of this app
  image text check (char_length(image) <= 500),
  product_id text,
  target text not null default 'all' check (target in ('all', 'test')),
  test_phone text,
  sent_by text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  total int not null default 0,
  sent int not null default 0,     -- the phone's push service took it
  failed int not null default 0,   -- it refused or didn't answer
  removed int not null default 0   -- the address was gone (alerts turned off, app removed): deleted
);
alter table public.push_messages enable row level security;
revoke insert, update, delete, truncate, trigger, references on public.push_messages from anon, authenticated;
drop policy if exists push_messages_admin_read on public.push_messages;
create policy push_messages_admin_read on public.push_messages for select to anon, authenticated
  using ((select public.is_admin()));

-- The app turns alerts on (or refreshes them: language, who is logged in). Only real push services' addresses are
-- kept, so the sender never posts anywhere else.
create or replace function public.push_subscribe(p_device text, p_token text, p_sub jsonb, p_lang text default 'en')
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_dev text;
  v_end text := p_sub ->> 'endpoint';
  v_p256 text := p_sub #>> '{keys,p256dh}';
  v_auth text := p_sub #>> '{keys,auth}';
  v_uid uuid;
  v_lang text := case when p_lang = 'kn' then 'kn' else 'en' end;
begin
  if coalesce(p_device, '') !~ '^[A-Za-z0-9_-]{16,128}$' then
    return jsonb_build_object('ok', false, 'error', 'bad_device');
  end if;
  if length(coalesce(v_end, '')) > 1000
     or coalesce(v_end, '') !~ '^https://(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/[^\s]+$'
     or coalesce(v_p256, '') !~ '^[A-Za-z0-9_-]{86,88}={0,2}$'
     or coalesce(v_auth, '') !~ '^[A-Za-z0-9_-]{21,24}={0,2}$' then
    return jsonb_build_object('ok', false, 'error', 'bad_subscription');
  end if;
  v_dev := public.sha256_hex(p_device);
  if coalesce(p_token, '') <> '' then
    select c.user_id into v_uid from public.customer_session_row(p_token) c;
  end if;

  insert into public.push_subscriptions as s (endpoint, p256dh, auth, device_hash, user_id, lang)
  values (v_end, v_p256, v_auth, v_dev, v_uid, v_lang)
  on conflict (endpoint) do update
     set p256dh = excluded.p256dh, auth = excluded.auth, device_hash = excluded.device_hash,
         user_id = coalesce(excluded.user_id, s.user_id), lang = excluded.lang, updated_at = now();

  -- one phone keeps its 3 newest (the browser and the Home Screen app each have one; browsers renew them)
  delete from public.push_subscriptions s
   where s.device_hash = v_dev
     and s.id not in (select s2.id from public.push_subscriptions s2 where s2.device_hash = v_dev
                       order by s2.updated_at desc, s2.id desc limit 3);
  return jsonb_build_object('ok', true);
end $$;

-- The app turns alerts off: only for the phone that turned them on
create or replace function public.push_unsubscribe(p_device text, p_endpoint text)
returns jsonb language sql volatile security definer set search_path = ''
as $$
  with gone as (
    delete from public.push_subscriptions s
     where s.endpoint = p_endpoint and s.device_hash = public.sha256_hex(coalesce(p_device, ''))
    returning 1)
  select jsonb_build_object('ok', true, 'removed', (select count(*) from gone))
$$;

-- Admin panel: how many phones get alerts
create or replace function public.push_stats()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select case when public.is_admin() then jsonb_build_object('ok', true,
           'phones', (select count(distinct s.device_hash) from public.push_subscriptions s),
           'kn', (select count(distinct s.device_hash) from public.push_subscriptions s where s.lang = 'kn'))
         else jsonb_build_object('ok', false) end
$$;

-- The sender adds each batch's results (only the sender may call this)
create or replace function public.push_tally(p_id bigint, p_sent int, p_failed int, p_removed int, p_done boolean)
returns jsonb language sql volatile security definer set search_path = ''
as $$
  update public.push_messages m
     set sent = m.sent + greatest(coalesce(p_sent, 0), 0),
         failed = m.failed + greatest(coalesce(p_failed, 0), 0),
         removed = m.removed + greatest(coalesce(p_removed, 0), 0),
         finished_at = case when p_done then coalesce(m.finished_at, now()) else m.finished_at end
   where m.id = p_id
  returning jsonb_build_object('total', m.total, 'sent', m.sent, 'failed', m.failed, 'removed', m.removed,
                               'done', m.finished_at is not null)
$$;

revoke execute on function public.push_subscribe(text, text, jsonb, text) from public;
revoke execute on function public.push_unsubscribe(text, text) from public;
revoke execute on function public.push_stats() from public;
revoke execute on function public.push_tally(bigint, int, int, int, boolean) from public, anon, authenticated;
grant execute on function public.push_subscribe(text, text, jsonb, text) to anon, authenticated;
grant execute on function public.push_unsubscribe(text, text) to anon, authenticated;
grant execute on function public.push_stats() to anon, authenticated;
grant execute on function public.push_tally(bigint, int, int, int, boolean) to service_role;
