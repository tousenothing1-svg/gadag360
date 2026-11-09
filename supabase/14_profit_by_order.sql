-- Royal Harvest: profit on each order, for the Profit page's "By order" list and the order breakdown.
--
-- order_money() works out each order's money once, the same way for everything (13_profit_all_money.sql):
--     customer paid  − your cost of the products  − the tip (for the delivery boy)  − not counted  = profit
-- profit_summary() (today, the month, each day) now adds those up, so an order's profit and the totals always agree.

-- Each order's money: the orders that came in during [p_from, p_to) (UTC, cancelled ones left out), or the one
-- order p_order whatever its status. Called only by the functions below.
create or replace function public.order_money(p_from timestamp, p_to timestamp, p_order text default null)
returns table (order_id text, created_at timestamp, status text, user_id uuid, payment text,
               paid numeric, fee numeric, tip numeric, discount numeric,
               sales numeric, sales_with_cost numeric, sales_no_cost numeric, cost numeric,
               items bigint, items_no_cost bigint, other numeric, not_counted numeric, profit numeric)
language sql stable security definer set search_path = ''
as $$
  with ord as (
    select o.id, o.created_at, o.status, o.user_id, o.payment,
           coalesce(o.total, 0)::numeric as paid,
           coalesce(o.delivery_fee, 0)::numeric as fee,
           coalesce(o.tip, 0)::numeric as tip,
           coalesce(o.discount, 0)::numeric as discount,
           coalesce(l.sales, 0) as sales,
           coalesce(l.sales_with_cost, 0) as sales_with_cost,
           coalesce(l.sales_no_cost, 0) as sales_no_cost,
           coalesce(l.cost, 0) as cost,
           coalesce(l.items, 0) as items,
           coalesce(l.items_no_cost, 0) as items_no_cost
      from public.orders o
      left join lateral (
        select sum(i.quantity::numeric * i.price) as sales,
               sum(i.quantity::numeric * i.price) filter (where c.item_id is not null) as sales_with_cost,
               sum(i.quantity::numeric * i.price) filter (where c.item_id is null) as sales_no_cost,
               sum(c.cost) as cost,
               count(*) as items,
               count(*) filter (where c.item_id is null) as items_no_cost
          from public.order_items i
          left join public.order_item_costs c on c.item_id = i.id
         where i.order_id = o.id
      ) l on true
     where case when p_order is not null then o.id = p_order
                else o.status is distinct from 'cancelled' and o.created_at >= p_from and o.created_at < p_to end
  ), x as (
    select ord.*,
           -- 0 for every order the database took in; only older orders can have a total that doesn't add up
           ord.paid - (ord.sales + ord.fee + ord.tip - ord.discount) as other,
           -- what was paid for products with no cost (never more than was paid for products at all)
           least(ord.sales_no_cost + greatest(ord.paid - (ord.sales + ord.fee + ord.tip - ord.discount), 0),
                 greatest(ord.paid - ord.fee - ord.tip, 0)) as not_counted
      from ord
  )
  select x.id, x.created_at, x.status, x.user_id, x.payment, x.paid, x.fee, x.tip, x.discount,
         x.sales, x.sales_with_cost, x.sales_no_cost, x.cost, x.items, x.items_no_cost,
         x.other, x.not_counted, x.paid - x.tip - x.cost - x.not_counted
    from x
$$;
revoke all on function public.order_money(timestamp, timestamp, text) from public, anon, authenticated;

-- Totals for India-time days [p_from, p_to): the orders' money added up. Called only by profit_report().
create or replace function public.profit_summary(p_from date, p_to date)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'orders', count(*),
    'paid', coalesce(sum(m.paid), 0),
    'sales', coalesce(sum(m.sales), 0),
    'delivery_fees', coalesce(sum(m.fee), 0),
    'tips', coalesce(sum(m.tip), 0),
    'discounts', coalesce(sum(m.discount), 0),
    'other', coalesce(sum(m.other), 0),
    'items', coalesce(sum(m.items), 0),
    'items_no_cost', coalesce(sum(m.items_no_cost), 0),
    'sales_no_cost', coalesce(sum(m.sales_no_cost), 0),
    'sales_with_cost', coalesce(sum(m.sales_with_cost), 0),
    'cost', coalesce(sum(m.cost), 0),
    'not_counted', coalesce(sum(m.not_counted), 0),
    'product_profit', coalesce(sum(m.sales_with_cost - m.cost), 0),  -- the products alone
    'profit', coalesce(sum(m.profit), 0)
  )
  from public.order_money((p_from::timestamp at time zone 'Asia/Kolkata') at time zone 'UTC',
                          (p_to::timestamp at time zone 'Asia/Kolkata') at time zone 'UTC') m
$$;
revoke all on function public.profit_summary(date, date) from public, anon, authenticated;

-- The report: today, one month (this month unless p_month says otherwise), each order, each day and each product
-- of that month. No login check here: only admin_profit() and the database owner can call it.
create or replace function public.profit_report(p_month date default null)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_month date := date_trunc('month', coalesce(p_month, v_today))::date;
  v_next date := (v_month + interval '1 month')::date;
  v_from timestamp := (v_month::timestamp at time zone 'Asia/Kolkata') at time zone 'UTC';
  v_to timestamp := (v_next::timestamp at time zone 'Asia/Kolkata') at time zone 'UTC';
begin
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
    -- each order, newest first, with who ordered it
    'orders', (select coalesce(jsonb_agg(jsonb_build_object(
                 'id', m.order_id, 'at', m.created_at,
                 'customer', coalesce(nullif(btrim(u.name), ''), u.phone),
                 'paid', m.paid, 'delivery_fee', m.fee, 'tips', m.tip, 'cost', m.cost, 'not_counted', m.not_counted,
                 'profit', m.profit, 'items', m.items, 'items_no_cost', m.items_no_cost)
                 order by m.created_at desc, m.order_id), '[]'::jsonb)
                 from public.order_money(v_from, v_to) m
                 left join public.users u on u.id = m.user_id),
    -- each day worked out exactly like today and the month
    'days', (select coalesce(jsonb_agg(public.profit_summary(d.day, d.day + 1) || jsonb_build_object('day', d.day)
                                       order by d.day desc), '[]'::jsonb)
               from (select distinct ((o.created_at at time zone 'UTC') at time zone 'Asia/Kolkata')::date as day
                       from public.orders o
                      where o.status is distinct from 'cancelled' and o.created_at >= v_from and o.created_at < v_to) d),
    -- the products alone: delivery charges and tips belong to orders, not to a product
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
revoke all on function public.profit_report(date) from public, anon, authenticated;

-- One order's breakdown for the admin panel: who ordered it, each item with your cost and profit, and the bill.
-- Only a logged-in admin gets it.
create or replace function public.admin_order_profit(p_order text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v jsonb;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'error', 'login');
  end if;
  select jsonb_build_object(
           'ok', true, 'id', m.order_id, 'at', m.created_at, 'status', m.status, 'payment', m.payment,
           'customer', nullif(btrim(u.name), ''), 'phone', u.phone,
           'paid', m.paid, 'sales', m.sales, 'delivery_fee', m.fee, 'tips', m.tip, 'discounts', m.discount,
           'other', m.other, 'cost', m.cost, 'not_counted', m.not_counted, 'profit', m.profit,
           'items', m.items, 'items_no_cost', m.items_no_cost,
           'lines', (select coalesce(jsonb_agg(jsonb_build_object(
                        'name', coalesce(nullif(btrim(i.product_name), ''), pr.name, i.product_id),
                        'variant', i.variant, 'quantity', i.quantity, 'price', i.price,
                        'sales', i.quantity::numeric * i.price,
                        'cost', c.cost,
                        'profit', case when c.item_id is not null then i.quantity::numeric * i.price - c.cost end)
                        order by i.position nulls last, i.created_at, i.id), '[]'::jsonb)
                       from public.order_items i
                       left join public.order_item_costs c on c.item_id = i.id
                       left join public.products pr on pr.id = coalesce(i.db_product_id, i.product_id)
                      where i.order_id = m.order_id))
    into v
    from public.order_money(null, null, left(coalesce(p_order, ''), 80)) m
    left join public.users u on u.id = m.user_id;
  return coalesce(v, jsonb_build_object('ok', false, 'error', 'not_found'));
end $$;
revoke all on function public.admin_order_profit(text) from public;
grant execute on function public.admin_order_profit(text) to anon, authenticated;  -- it checks the admin login itself
