-- Royal Harvest alerts: the app's VAPID key pair (it signs every push so phones know it's from Royal Harvest).
-- The send-push function makes the pair once with Web Crypto and saves it here; the private half goes into Vault
-- (encrypted), so it never leaves Supabase. The app reads the public half to turn alerts on.

create table if not exists public.push_keys (
  id int primary key default 1 check (id = 1),
  public_key text not null check (public_key ~ '^[A-Za-z0-9_-]{86,88}$'),
  created_at timestamptz not null default now()
);
alter table public.push_keys enable row level security;
revoke all on public.push_keys from anon, authenticated;

-- the app: which key to subscribe with
create or replace function public.push_public_key()
returns text language sql stable security definer set search_path = ''
as $$ select k.public_key from public.push_keys k where k.id = 1 $$;

-- the sender only: keep a new pair (the first one saved wins) and read the private half back
create or replace function public.push_save_keys(p_public text, p_private text)
returns text language plpgsql volatile security definer set search_path = ''
as $$
declare v text;
begin
  perform pg_advisory_xact_lock(hashtext('royal-harvest-push-keys'));
  select k.public_key into v from public.push_keys k where k.id = 1;
  if v is not null then return v; end if;
  if coalesce(p_private, '') !~ '^[A-Za-z0-9_-]{42,44}$' then raise exception 'bad private key'; end if;
  perform vault.create_secret(p_private, 'royal_harvest_vapid_private', 'Royal Harvest web push signing key (send-push)');
  insert into public.push_keys (id, public_key) values (1, p_public);
  return p_public;
end $$;

create or replace function public.push_private_key()
returns text language sql stable security definer set search_path = ''
as $$
  select s.decrypted_secret from vault.decrypted_secrets s
   where s.name = 'royal_harvest_vapid_private' order by s.created_at desc limit 1
$$;

revoke execute on function public.push_public_key() from public;
revoke execute on function public.push_save_keys(text, text) from public, anon, authenticated;
revoke execute on function public.push_private_key() from public, anon, authenticated;
grant execute on function public.push_public_key() to anon, authenticated, service_role;
grant execute on function public.push_save_keys(text, text) to service_role;
grant execute on function public.push_private_key() to service_role;
