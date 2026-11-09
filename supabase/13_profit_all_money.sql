-- Royal Harvest: the profit report counts all the money customers pay.
--
-- Before, profit was only the products: what customers paid for them minus your cost. Delivery charges and tips
-- were shown on the side. Now it follows each order's money:
--
--     customers paid      the order total: products + delivery charge + tip − any discount
--   − your cost           of the products, as it was when the order came in (order_item_costs)
--   − the tip             it's for the delivery boy ("Tip your delivery partner" in the shop)
--   − not counted         money for products that had no cost when ordered: their profit isn't known
--   = profit
--
-- So delivery charges are profit and discounts come off it. Older orders (from before the database checked
-- orders) whose total doesn't match their items: whatever can't be matched to a product with a cost isn't counted
-- either. Cancelled orders don't count. Days and months are India time.

-- Totals for India-time days [p_from, p_to). Called only by profit_report().
create or replace function public.profit_summary(p_from date, p_to date)
returns jsonb language sql stable security definer set search_path = ''
as $$
  with ord as (
    select coalesce(o.total, 0)::numeric as paid,
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
     where o.status is distinct from 'cancelled'
       and o.created_at >= ((p_from::timestamp at time zone 'Asia/Kolkata') at time zone 'UTC')
       and o.created_at <  ((p_to::timestamp at time zone 'Asia/Kolkata') at time zone 'UTC')
  ), x as (
    select ord.*,
           -- 0 for every order the database took in; only older orders can have a total that doesn't add up
           ord.paid - (ord.sales + ord.fee + ord.tip - ord.discount) as other,
           -- what was paid for products with no cost (never more than was paid for products at all)
           least(ord.sales_no_cost + greatest(ord.paid - (ord.sales + ord.fee + ord.tip - ord.discount), 0),
                 greatest(ord.paid - ord.fee - ord.tip, 0)) as not_counted
      from ord
  )
  select jsonb_build_object(
    'orders', count(*),
    'paid', coalesce(sum(paid), 0),
    'sales', coalesce(sum(sales), 0),
    'delivery_fees', coalesce(sum(fee), 0),
    'tips', coalesce(sum(tip), 0),
    'discounts', coalesce(sum(discount), 0),
    'other', coalesce(sum(other), 0),
    'items', coalesce(sum(items), 0),
    'items_no_cost', coalesce(sum(items_no_cost), 0),
    'sales_no_cost', coalesce(sum(sales_no_cost), 0),
    'sales_with_cost', coalesce(sum(sales_with_cost), 0),
    'cost', coalesce(sum(cost), 0),
    'not_counted', coalesce(sum(not_counted), 0),
    'product_profit', coalesce(sum(sales_with_cost - cost), 0),  -- the products alone, as before
    'profit', coalesce(sum(paid - tip - cost - not_counted), 0)
  )
  from x
$$;
revoke all on function public.profit_summary(date, date) from public, anon, authenticated;

-- The report: today, one month (this month unless p_month says otherwise), each day of that month and each
-- product sold in it. No login check here: only admin_profit() and the database owner can call it.
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

-- The admin panel's Profit page and dashboard. Only a logged-in admin gets it.
create or replace function public.admin_profit(p_month date default null)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'error', 'login');
  end if;
  return public.profit_report(p_month);
end $$;
revoke all on function public.admin_profit(date) from public;
grant execute on function public.admin_profit(date) to anon, authenticated;  -- it checks the admin login itself
