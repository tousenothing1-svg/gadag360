-- Royal Harvest: profit on orders, for the admin panel's Profit page and dashboard.
--
-- When an order comes in, each item's cost is saved from "Your cost" for that product at that moment
-- (order_item_costs), so changing a cost later never rewrites past profit. Items of products that had no cost yet
-- get no row: the report counts them as "no cost" instead of guessing.
--
-- Profit = what customers paid for the products − your cost for them. Cancelled orders don't count.
-- Days and months are India time.

create table if not exists public.order_item_costs (
  item_id uuid primary key references public.order_items(id) on delete cascade,
  order_id text not null,
  product_id text not null,
  unit_cost numeric(10,2) not null,  -- your cost for the product's unit at the time
  units numeric(12,3) not null,      -- units the item used: 2 × 250g of a 1kg product is 0.5
  cost numeric(12,2) not null,       -- unit_cost × units
  created_at timestamptz not null default now()
);
create index if not exists order_item_costs_order on public.order_item_costs (order_id);
alter table public.order_item_costs enable row level security;
revoke all on public.order_item_costs from anon, authenticated;  -- read only through admin_profit()

-- Save the cost as each item is added (place_order adds them). Never stops an order.
create or replace function public.order_items_cost_snapshot()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  begin
    insert into public.order_item_costs (item_id, order_id, product_id, unit_cost, units, cost)
    select new.id, new.order_id, c.product_id, c.cost, u.units, round(c.cost * u.units, 2)
      from public.product_costs c
      cross join lateral (
        select coalesce(new.stock_used,
                        new.quantity * public.size_ratio(new.variant, (select p.unit from public.products p where p.id = c.product_id))
               )::numeric(12,3) as units
      ) u
     where c.product_id = coalesce(new.db_product_id, new.product_id)
    on conflict (item_id) do nothing;
  exception when others then
    null; -- the order matters more than its profit figure
  end;
  return null;
end $$;
revoke all on function public.order_items_cost_snapshot() from public, anon, authenticated;
drop trigger if exists order_items_cost_snapshot on public.order_items;
create trigger order_items_cost_snapshot after insert on public.order_items
  for each row execute function public.order_items_cost_snapshot();

-- Orders that came in after a cost was typed (and before this existed) get it too: that cost hasn't changed since.
insert into public.order_item_costs (item_id, order_id, product_id, unit_cost, units, cost)
select i.id, i.order_id, c.product_id, c.cost, u.units, round(c.cost * u.units, 2)
  from public.order_items i
  join public.orders o on o.id = i.order_id
  join public.product_costs c on c.product_id = coalesce(i.db_product_id, i.product_id)
  cross join lateral (
    select coalesce(i.stock_used,
                    i.quantity * public.size_ratio(i.variant, (select p.unit from public.products p where p.id = c.product_id))
           )::numeric(12,3) as units
  ) u
 where (o.created_at at time zone 'UTC') >= c.updated_at
on conflict (item_id) do nothing;

-- Totals for India-time days [p_from, p_to). Called only by admin_profit().
create or replace function public.profit_summary(p_from date, p_to date)
returns jsonb language sql stable security definer set search_path = ''
as $$
  with o as (
    select o.id, coalesce(o.delivery_fee, 0) as delivery_fee
      from public.orders o
     where o.status is distinct from 'cancelled'
       and o.created_at >= ((p_from::timestamp at time zone 'Asia/Kolkata') at time zone 'UTC')
       and o.created_at <  ((p_to::timestamp at time zone 'Asia/Kolkata') at time zone 'UTC')
  ), l as (
    select i.quantity::numeric * i.price as sales, c.cost
      from o
      join public.order_items i on i.order_id = o.id
      left join public.order_item_costs c on c.item_id = i.id
  )
  select jsonb_build_object(
    'orders', (select count(*) from o),
    'delivery_fees', (select coalesce(sum(delivery_fee), 0) from o),
    'sales', coalesce(sum(sales), 0),
    'items', count(*),
    'items_no_cost', count(*) filter (where cost is null),
    'sales_no_cost', coalesce(sum(sales) filter (where cost is null), 0),
    'sales_with_cost', coalesce(sum(sales) filter (where cost is not null), 0),
    'cost', coalesce(sum(cost), 0),
    'profit', coalesce(sum(sales - cost) filter (where cost is not null), 0)
  )
  from l
$$;
revoke all on function public.profit_summary(date, date) from public, anon, authenticated;

-- The admin panel's report: today, one month (this month unless p_month says otherwise), each day of that month and
-- each product sold in it. Only a logged-in admin gets it.
create or replace function public.admin_profit(p_month date default null)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_month date;
  v_next date;
  v_from timestamp;
  v_to timestamp;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'error', 'login');
  end if;
  v_month := date_trunc('month', coalesce(p_month, v_today))::date;
  v_next := (v_month + interval '1 month')::date;
  v_from := (v_month::timestamp at time zone 'Asia/Kolkata') at time zone 'UTC';
  v_to := (v_next::timestamp at time zone 'Asia/Kolkata') at time zone 'UTC';
  return jsonb_build_object(
    'ok', true,
    'today', v_today,
    'month', v_month,
    'today_sum', public.profit_summary(v_today, v_today + 1),
    'month_sum', public.profit_summary(v_month, v_next),
    'months', (select coalesce(jsonb_agg(m order by m desc), '[]'::jsonb) from (
                 select distinct date_trunc('month', (o.created_at at time zone 'UTC') at time zone 'Asia/Kolkata')::date as m
                   from public.orders o
                  where o.status is distinct from 'cancelled') x),
    'days', (select coalesce(jsonb_agg(to_jsonb(d) order by d.day desc), '[]'::jsonb) from (
               select ((o.created_at at time zone 'UTC') at time zone 'Asia/Kolkata')::date as day,
                      count(distinct o.id) as orders,
                      coalesce(sum(i.quantity::numeric * i.price), 0) as sales,
                      coalesce(sum(i.quantity::numeric * i.price - c.cost) filter (where c.cost is not null), 0) as profit,
                      coalesce(sum(i.quantity::numeric * i.price) filter (where c.cost is not null), 0) as sales_with_cost,
                      count(*) filter (where c.item_id is null) as items_no_cost
                 from public.orders o
                 join public.order_items i on i.order_id = o.id
                 left join public.order_item_costs c on c.item_id = i.id
                where o.status is distinct from 'cancelled' and o.created_at >= v_from and o.created_at < v_to
                group by 1) d),
    'products', (select coalesce(jsonb_agg(to_jsonb(p) order by p.sales desc, p.name), '[]'::jsonb) from (
                   select coalesce(i.db_product_id, i.product_id) as product_id,
                          coalesce(max(pr.name), max(i.product_name)) as name,
                          max(pr.unit) as unit,
                          round(sum(coalesce(i.stock_used, i.quantity)), 3) as units,
                          sum(i.quantity::numeric * i.price) as sales,
                          coalesce(sum(i.quantity::numeric * i.price) filter (where c.cost is not null), 0) as sales_with_cost,
                          coalesce(sum(c.cost), 0) as cost,
                          coalesce(sum(i.quantity::numeric * i.price - c.cost) filter (where c.cost is not null), 0) as profit,
                          count(*) as items,
                          count(*) filter (where c.item_id is null) as items_no_cost
                     from public.orders o
                     join public.order_items i on i.order_id = o.id
                     left join public.order_item_costs c on c.item_id = i.id
                     left join public.products pr on pr.id = coalesce(i.db_product_id, i.product_id)
                    where o.status is distinct from 'cancelled' and o.created_at >= v_from and o.created_at < v_to
                    group by 1) p)
  );
end $$;
revoke all on function public.admin_profit(date) from public;
grant execute on function public.admin_profit(date) to anon, authenticated;  -- it checks the admin login itself
