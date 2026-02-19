-- Disable RLS on all tables to allow the application to connect freely
-- (Since we are using the anonymous key for a backend app in this setup)

alter table public.users disable row level security;
alter table public.stock disable row level security;
alter table public.batches disable row level security;
alter table public.orders disable row level security;
alter table public.transactions disable row level security;

-- Confirm data exists by re-inserting if missing (idempotent)
insert into public.users (email, password, role)
values ('admin@paneer.com', 'admin123', 'admin')
on conflict (email) do nothing;

insert into public.stock (current_stock, selling_price_per_kg, purchase_price_per_kg)
select 0, 320, 280
where not exists (select 1 from public.stock);
