-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Users Table
create table public.users (
  id uuid default uuid_generate_v4() primary key,
  email text unique not null,
  password text not null, -- In a real app, please hash passwords!
  role text default 'user',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Stock Table
create table public.stock (
  id uuid default uuid_generate_v4() primary key,
  current_stock numeric default 0,
  selling_price_per_kg numeric default 0,
  purchase_price_per_kg numeric default 0,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Batches Table
create table public.batches (
  id uuid default uuid_generate_v4() primary key,
  quantity numeric not null,
  purchase_price numeric not null,
  previous_stock numeric not null,
  updated_stock numeric not null,
  timestamp timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. Orders Table
create table public.orders (
  id uuid default uuid_generate_v4() primary key,
  customer_name text not null,
  shop_name text,
  type text,
  quantity numeric not null,
  selling_price numeric not null,
  purchase_price numeric not null,
  total_amount numeric not null,
  delivery_time timestamp with time zone,
  status text default 'Pending',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 5. Transactions Table
create table public.transactions (
  id uuid default uuid_generate_v4() primary key,
  order_id uuid references public.orders(id),
  amount numeric not null,
  payment_mode text,
  timestamp timestamp with time zone default timezone('utc'::text, now()) not null
);

-- SEED DATA --

-- Default Admin User
insert into public.users (email, password, role)
values ('admin@paneer.com', 'admin123', 'admin')
on conflict (email) do nothing;

-- Initial Stock Record (Must exist for the app to work)
insert into public.stock (current_stock, selling_price_per_kg, purchase_price_per_kg)
select 0, 320, 280
where not exists (select 1 from public.stock);
