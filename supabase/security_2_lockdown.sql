-- Royal Harvest: customer data security, part 2 of 2: lock the tables.
-- Apply only after the new customer app, admin panel and rider panel are live,
-- because from here on they must use the functions from part 1.

-- 1. Remove every old "anyone can read and change everything" policy
do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- 2. Products: everyone can read the catalog; only a logged-in admin can change it
alter table public.products enable row level security;
create policy products_read on public.products
  for select to anon, authenticated using (true);
create policy products_admin_insert on public.products
  for insert to anon, authenticated with check ((select public.is_admin()));
create policy products_admin_update on public.products
  for update to anon, authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy products_admin_delete on public.products
  for delete to anon, authenticated using ((select public.is_admin()));

-- 3. Customers, orders, suppliers (bank details), riders and the unused tables: logged-in admin only.
--    Customers and riders reach their own data through the functions from part 1.
do $$
declare t text;
begin
  foreach t in array array['users', 'orders', 'order_items', 'vendors', 'delivery_boys',
                           'reviews', 'saved_addresses', 'wishlists'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy admin_all on public.%I for all to anon, authenticated '
                   'using ((select public.is_admin())) with check ((select public.is_admin()))', t);
  end loop;
end $$;

-- 4. Rider passwords: keep only the bcrypt hash (rider_credentials), never the plain text
alter table public.delivery_boys alter column password drop not null;

create or replace function public.delivery_boys_password_hash()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.password is not null and new.password <> '' then
    insert into public.rider_credentials (rider_id, pass_hash)
    values (new.id, extensions.crypt(new.password, extensions.gen_salt('bf', 10)))
    on conflict (rider_id) do update
      set pass_hash = excluded.pass_hash, failed_attempts = 0, locked_until = null, updated_at = now();
    delete from public.staff_sessions where kind = 'rider' and subject_id = new.id; -- new password: sign out everywhere
  end if;
  new.password := null; -- never keep the plain text
  return new;
end $$;

update public.delivery_boys set password = null where password is not null;

-- 5. Trigger functions run only as triggers, never as API calls
revoke all on function public.delivery_boys_password_hash(), public.delivery_boys_cleanup(),
  public.orders_revoke_coins() from public, anon, authenticated;
