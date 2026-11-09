-- Royal Harvest: your cost for each product (what the vendor charges you for the product's unit), so the admin
-- panel can show the profit on every product.
--
-- It lives in its own table that only a logged-in admin can read or change. Customers can read the products table
-- (that's the shop's catalog), so the cost must never be a column there.
create table if not exists public.product_costs (
  product_id text primary key references public.products(id) on delete cascade,
  cost numeric(10,2) not null check (cost >= 0 and cost < 1000000),  -- rupees for the product's unit, like 190 or 18.50
  updated_at timestamptz not null default now()
);

alter table public.product_costs enable row level security;
revoke all on public.product_costs from anon, authenticated;
grant select, insert, update, delete on public.product_costs to anon, authenticated;  -- and the policy: admins only
drop policy if exists product_costs_admin on public.product_costs;
create policy product_costs_admin on public.product_costs for all to anon, authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- updated_at follows every change
create or replace function public.product_costs_touch()
returns trigger language plpgsql set search_path = ''
as $$ begin new.updated_at := now(); return new; end $$;
revoke all on function public.product_costs_touch() from public, anon, authenticated;
drop trigger if exists product_costs_touch on public.product_costs;
create trigger product_costs_touch before update on public.product_costs
  for each row execute function public.product_costs_touch();
