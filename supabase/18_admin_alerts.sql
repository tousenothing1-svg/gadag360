-- Royal Harvest: new-order alerts for the admin, the same way the delivery boys get theirs (9_rider_alerts.sql).
--
-- The admin turns on order alerts in the admin panel, on a phone or a computer (admin_push_subscribe, with the admin
-- login). When a customer places an order, a trigger asks the send-push function to alert every admin device
-- ("admin" action). The function asks admin_alert_claim what is due: each order is announced once, so a repeated call
-- never sends twice.

create table if not exists public.admin_push (
  id bigint generated always as identity primary key,
  admin_id text not null,                    -- public.admins.id
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists admin_push_admin on public.admin_push (admin_id);
alter table public.admin_push enable row level security;
revoke all on public.admin_push from public, anon, authenticated;

create table if not exists public.admin_alerts (
  order_id text primary key,
  sent_at timestamptz not null default now(),
  phones int not null default 0
);
alter table public.admin_alerts enable row level security;
revoke all on public.admin_alerts from public, anon, authenticated;

-- The admin panel turns order alerts on for the logged-in admin (only real push services' addresses are kept)
create or replace function public.admin_push_subscribe(p_token text, p_sub jsonb)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_aid text := public.staff_subject(p_token, 'admin');
  v_end text := p_sub ->> 'endpoint';
  v_p256 text := p_sub #>> '{keys,p256dh}';
  v_auth text := p_sub #>> '{keys,auth}';
begin
  if v_aid is null then return jsonb_build_object('ok', false, 'error', 'login'); end if;
  if length(coalesce(v_end, '')) > 1000
     or coalesce(v_end, '') !~ '^https://(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/[^\s]+$'
     or coalesce(v_p256, '') !~ '^[A-Za-z0-9_-]{86,88}={0,2}$'
     or coalesce(v_auth, '') !~ '^[A-Za-z0-9_-]{21,24}={0,2}$' then
    return jsonb_build_object('ok', false, 'error', 'bad_subscription');
  end if;
  insert into public.admin_push as r (admin_id, endpoint, p256dh, auth)
  values (v_aid, v_end, v_p256, v_auth)
  on conflict (endpoint) do update
     set admin_id = excluded.admin_id, p256dh = excluded.p256dh, auth = excluded.auth, updated_at = now();
  -- an admin keeps their 5 newest phones/computers
  delete from public.admin_push r
   where r.admin_id = v_aid
     and r.id not in (select r2.id from public.admin_push r2 where r2.admin_id = v_aid order by r2.updated_at desc, r2.id desc limit 5);
  return jsonb_build_object('ok', true, 'devices', (select count(*) from public.admin_push r where r.admin_id = v_aid));
end $$;

-- Turning off (or logging out): only the logged-in admin's own address
create or replace function public.admin_push_unsubscribe(p_token text, p_endpoint text)
returns jsonb language sql volatile security definer set search_path = ''
as $$
  with gone as (
    delete from public.admin_push r
     where r.endpoint = p_endpoint and r.admin_id = public.staff_subject(p_token, 'admin')
    returning 1)
  select jsonb_build_object('ok', true, 'removed', (select count(*) from gone))
$$;

-- The sender only: a new order to announce, claimed so it's sent once, and every admin's devices
create or replace function public.admin_alert_claim(p_order text)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  o record;
  v_items int;
begin
  select x.id, x.status, x.total, x.payment, x.delivery_slot, x.address, x.user_id
    into o from public.orders x where x.id = p_order;
  if o.id is null or o.status in ('cancelled', 'delivered') then return jsonb_build_object('ok', true); end if;
  insert into public.admin_alerts (order_id) values (o.id) on conflict do nothing;
  if not found then return jsonb_build_object('ok', true); end if; -- announced already
  select count(*) into v_items from public.order_items i where i.order_id = o.id;
  return jsonb_build_object('ok', true, 'kind', 'placed',
    'order', jsonb_build_object('id', o.id, 'total', o.total, 'payment', o.payment, 'slot', o.delivery_slot,
                                'address', left(coalesce(o.address, ''), 140), 'items', v_items,
                                'customer', (select left(nullif(btrim(u.name), ''), 40) from public.users u where u.id = o.user_id)),
    'phones', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'endpoint', p.endpoint, 'p256dh', p.p256dh, 'auth', p.auth))
                          from public.admin_push p
                         where exists (select 1 from public.admins a where a.id::text = p.admin_id)), '[]'::jsonb));
end $$;

-- When a customer places an order, ask the sender to alert the admin (only if an admin turned alerts on).
-- A problem here must never stop the order from being saved.
create or replace function public.orders_admin_alert()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.admin_push) then
    begin
      perform net.http_post(
        url := 'https://lykhjuizzvurklywxflz.supabase.co/functions/v1/send-push',
        body := jsonb_build_object('action', 'admin', 'order_id', new.id),
        headers := '{"Content-Type": "application/json"}'::jsonb,
        timeout_milliseconds := 8000);
    exception when others then
      null;
    end;
  end if;
  return null;
end $$;
drop trigger if exists orders_admin_alert on public.orders;
create trigger orders_admin_alert after insert on public.orders
  for each row execute function public.orders_admin_alert();

revoke execute on function public.admin_push_subscribe(text, jsonb) from public;
revoke execute on function public.admin_push_unsubscribe(text, text) from public;
revoke execute on function public.admin_alert_claim(text) from public, anon, authenticated;
revoke execute on function public.orders_admin_alert() from public, anon, authenticated;
grant execute on function public.admin_push_subscribe(text, jsonb) to anon, authenticated;
grant execute on function public.admin_push_unsubscribe(text, text) to anon, authenticated;
grant execute on function public.admin_alert_claim(text) to service_role;
