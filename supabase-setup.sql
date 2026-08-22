-- ============================================================
-- ANBU BLACK OPS — Supabase setup (v2)
-- ------------------------------------------------------------
-- Run this ONCE:
--   1. Open https://supabase.com/dashboard  -> your project
--      (mdjunotrttklmsgkrkwd)
--   2. Left sidebar: SQL Editor -> New query
--   3. Paste this whole file and press RUN.
--
-- What it creates:
--   * anbu_store — the single key/value table the ENTIRE app uses:
--       members (including profile photos),
--       projects (including report images),
--       APK binaries (split into "…#partN" rows when large),
--       news feed, admin record.
--     Photos and report images are stored as base64 data URLs
--     inside the jsonb `value` column, so they persist exactly
--     like every other field and are shared by all visitors.
--   * RLS policy — lets the site's PUBLISHABLE key read/write this
--     one table (nothing else in your project is reachable).
--   * grants     — explicit access for the anon / authenticated
--     roles Supabase maps API keys onto.
--   * updated_at — auto-maintained timestamp.
--
-- Safe to re-run: every statement is idempotent.
-- ============================================================

-- 1. The single table the app reads and writes.
create table if not exists anbu_store (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- 2. Explicit access for every role the REST API can present.
grant usage on schema public to anon, authenticated, service_role;
grant all on table anbu_store to anon, authenticated, service_role;

-- 3. Row Level Security. The publishable key must pass the policy
--    to read/write; `for all` with `using (true)` / `with check
--    (true)` grants full access to this table only.
alter table anbu_store enable row level security;

drop policy if exists "anbu public access" on anbu_store;
create policy "anbu public access"
  on anbu_store
  for all
  using (true)
  with check (true);

-- 4. Keep updated_at fresh automatically.
drop trigger if exists anbu_store_touch on anbu_store;
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;
create trigger anbu_store_touch
  before insert or update on anbu_store
  for each row execute function touch_updated_at();

-- 5. Speed up the "…#part%" lookups used for chunked image / APK
--    writes and the member-list / news-list index reads.
create index if not exists anbu_store_key_like_idx
  on anbu_store (key text_pattern_ops);

-- Done. The app now shares ONE database across every visitor:
--   SUPABASE_URL = https://mdjunotrttklmsgkrkwd.supabase.co
--   SUPABASE_KEY = sb_publishable_JctVpoYc-Kdoo6trbhuIGg_T-uvXr2k
-- Check the live storage mode at /api/health ("supabase" = shared).
