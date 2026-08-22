-- ============================================================
-- ANBU BLACK OPS — Supabase setup (run once in SQL Editor)
-- ------------------------------------------------------------
-- 1. Create tables used by lib/supabase.js
-- 2. Create the public image bucket
--
-- The server connects with the SERVICE ROLE key, which bypasses
-- Row Level Security, so no policies are required. Run this
-- script once after creating your project, then deploy.
-- ============================================================

-- Admin credential row (single row, id must be 1)
create table if not exists public.anbu_admin (
  id int primary key check (id = 1),
  salt text not null,
  hash text not null
);

-- Operative roster. slug is the URL id (profile.html?member=slug).
create table if not exists public.anbu_members (
  slug text primary key,
  payload jsonb not null
);

-- Mission files (projects). owner = operative slug, id = project id.
create table if not exists public.anbu_projects (
  owner text not null,
  id text not null,
  payload jsonb not null,
  updated_at bigint not null default 0,
  primary key (owner, id)
);

create index if not exists anbu_projects_owner_idx
  on public.anbu_projects (owner);

-- Optional: let the admin seed its row via the app (the app inserts it).
-- Uncomment the next three lines ONLY if you want a specific password
-- hashed here instead of letting the app seed the default admin.
-- insert into public.anbu_admin (id, salt, hash)
-- select 1, 'replace-with-salt', 'replace-with-hash'
-- where not exists (select 1 from public.anbu_admin where id = 1);

-- Public image bucket used for photos + report images.
-- The app also auto-creates it on first upload if it is missing.
insert into storage.buckets (id, name, public)
values ('anbu-images', 'anbu-images', true)
on conflict (id) do nothing;
