-- Minimal schema for WeTrust (Postgres)
create extension if not exists "uuid-ossp";

create table if not exists users (
  id uuid primary key default uuid_generate_v4(),
  phone text unique not null,
  created_at timestamptz not null default now(),
  stripe_account_id text,
  wallet_cents integer not null default 0
);

create table if not exists requests (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) on delete cascade,
  title text not null,
  description text not null,
  city text,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table if not exists matches (
  id uuid primary key default uuid_generate_v4(),
  request_id uuid references requests(id) on delete cascade,
  requester_id uuid references users(id) on delete cascade,
  helper_id uuid references users(id) on delete cascade,
  status text not null default 'pending', -- pending|accepted|paid|completed|disputed
  price_cents integer not null default 0,
  fee_cents integer not null default 0,
  voucher_applied_cents integer not null default 0,
  payment_intent_id text,
  payment_status text default 'none', -- none|requires_payment_method|requires_capture|succeeded|canceled
  stream_channel_id text,
  created_at timestamptz not null default now()
);

create table if not exists vouchers (
  code text primary key,
  amount_cents integer not null,
  status text not null default 'new', -- new|redeemed
  created_at timestamptz not null default now(),
  redeemed_by uuid references users(id),
  redeemed_at timestamptz
);
