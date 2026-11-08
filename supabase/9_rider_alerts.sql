-- Royal Harvest: order alerts for delivery boys.
--
-- A rider turns on order alerts in the delivery app (rider_push_subscribe, with their login). When the admin assigns
-- an order to a rider, or the customer cancels an order a rider was told about, a trigger asks the send-push
-- function to alert that rider ("rider" action). The function asks rider_alert_claim what is due: each rider hears
-- about each assignment and each cancellation once, so a repeated call never sends twice.

create extension if not exists pg_net; -- lets the database call the send-push function

create table if not exists public.rider_push (
  id bigint generated always as identity primary key,
  rider_id text not null references public.delivery_boys(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists rider_push_rider on public.rider_push (rider_id);
alter table public.rider_push enable row level security;
revoke all on public.rider_push from anon, authenticated;

create table if not exists public.rider_alerts (
  order_id text not null,
  rider_id text not null,
  kind text not null check (kind in ('assigned', 'cancelled')),
  sent_at timestamptz not null default now(),
  phones int not null default 0,
  primary key (order_id, rider_id, kind)
);
alter table public.rider_alerts enable row level security;
revoke all on public.rider_alerts from anon, authenticated;

-- The delivery app turns order alerts on for the logged-in rider (only real push services' addresses are kept)
create or replace function public.rider_push_subscribe(p_token text, p_sub jsonb)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_rid text := public.staff_subject(p_token, 'rider');
  v_end text := p_sub ->> 'endpoint';
  v_p256 text := p_sub #>> '{keys,p256dh}';
  v_auth text := p_sub #>> '{keys,auth}';
begin
  if v_rid is null then return jsonb_build_object('ok', false, 'error', 'session'); end if;
  if length(coalesce(v_end, '')) > 1000
     or coalesce(v_end, '') !~ '^https://(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/[^\s]+$'
     or coalesce(v_p256, '') !~ '^[A-Za-z0-9_-]{86,88}={0,2}$'
     or coalesce(v_auth, '') !~ '^[A-Za-z0-9_-]{21,24}={0,2}$' then
    return jsonb_build_object('ok', false, 'error', 'bad_subscription');
  end if;
  insert into public.rider_push as r (rider_id, endpoint, p256dh, auth)
  values (v_rid, v_end, v_p256, v_auth)
  on conflict (endpoint) do update
     set rider_id = excluded.rider_id, p256dh = excluded.p256dh, auth = excluded.auth, updated_at = now();
  -- a rider keeps their 3 newest phones/browsers
  delete from public.rider_push r
   where r.rider_id = v_rid
     and r.id not in (select r2.id from public.rider_push r2 where r2.rider_id = v_rid order by r2.updated_at desc, r2.id desc limit 3);
  return jsonb_build_object('ok', true);
end $$;

-- Turning off (or logging out): only the logged-in rider's own address
create or replace function public.rider_push_unsubscribe(p_token text, p_endpoint text)
returns jsonb language sql volatile security definer set search_path = ''
as $$
  with gone as (
    delete from public.rider_push r
     where r.endpoint = p_endpoint and r.rider_id = public.staff_subject(p_token, 'rider')
    returning 1)
  select jsonb_build_object('ok', true, 'removed', (select count(*) from gone))
$$;

-- The sender only: what this order's rider should hear now, claimed so it's sent once
create or replace function public.rider_alert_claim(p_order text)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  o record;
  v_kind text;
  v_items int;
begin
  select x.id, x.status, x.total, x.payment, x.delivery_slot, x.address, x.delivery_boy_id
    into o from public.orders x where x.id = p_order;
  if o.id is null or o.delivery_boy_id is null or o.status = 'delivered' then
    return jsonb_build_object('ok', true);
  end if;
  if o.status = 'cancelled' then
    -- only a rider who was told about the order hears that it's off
    if not exists (select 1 from public.rider_alerts a
                    where a.order_id = o.id and a.rider_id = o.delivery_boy_id and a.kind = 'assigned') then
      return jsonb_build_object('ok', true);
    end if;
    v_kind := 'cancelled';
  else
    v_kind := 'assigned';
  end if;
  insert into public.rider_alerts (order_id, rider_id, kind) values (o.id, o.delivery_boy_id, v_kind)
  on conflict do nothing;
  if not found then return jsonb_build_object('ok', true); end if; -- told already
  select count(*) into v_items from public.order_items i where i.order_id = o.id;
  return jsonb_build_object('ok', true, 'kind', v_kind, 'rider_id', o.delivery_boy_id,
    'order', jsonb_build_object('id', o.id, 'total', o.total, 'payment', o.payment, 'slot', o.delivery_slot,
                                'address', left(coalesce(o.address, ''), 140), 'items', v_items),
    'phones', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'endpoint', p.endpoint, 'p256dh', p.p256dh, 'auth', p.auth))
                          from public.rider_push p where p.rider_id = o.delivery_boy_id), '[]'::jsonb));
end $$;

-- Admin panel: which riders have order alerts on
create or replace function public.rider_alert_phones()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select case when public.is_admin() then jsonb_build_object('ok', true, 'riders',
           coalesce((select jsonb_object_agg(r.rider_id, r.n) from (select rider_id, count(*) as n from public.rider_push group by 1) r), '{}'::jsonb))
         else jsonb_build_object('ok', false) end
$$;

-- When an order is assigned to a rider (or cancelled after), ask the sender to alert them.
-- A problem here must never stop the order from being saved.
create or replace function public.orders_rider_alert()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.delivery_boy_id is not null
     and (tg_op = 'INSERT'
          or new.delivery_boy_id is distinct from old.delivery_boy_id
          or (new.status = 'cancelled' and old.status is distinct from 'cancelled')) then
    begin
      perform net.http_post(
        url := 'https://lykhjuizzvurklywxflz.supabase.co/functions/v1/send-push',
        body := jsonb_build_object('action', 'rider', 'order_id', new.id),
        headers := '{"Content-Type": "application/json"}'::jsonb,
        timeout_milliseconds := 8000);
    exception when others then
      null;
    end;
  end if;
  return null;
end $$;
drop trigger if exists orders_rider_alert on public.orders;
create trigger orders_rider_alert after insert or update of delivery_boy_id, status on public.orders
  for each row execute function public.orders_rider_alert();

revoke execute on function public.rider_push_subscribe(text, jsonb) from public;
revoke execute on function public.rider_push_unsubscribe(text, text) from public;
revoke execute on function public.rider_alert_claim(text) from public, anon, authenticated;
revoke execute on function public.rider_alert_phones() from public;
revoke execute on function public.orders_rider_alert() from public, anon, authenticated;
grant execute on function public.rider_push_subscribe(text, jsonb) to anon, authenticated;
grant execute on function public.rider_push_unsubscribe(text, text) to anon, authenticated;
grant execute on function public.rider_alert_claim(text) to service_role;
grant execute on function public.rider_alert_phones() to anon, authenticated;
