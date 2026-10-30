-- Hane Puzzle Generator: class inbox (M16, D-049).
-- Paste this whole file into Supabase > SQL Editor > New query, then press Run.
-- It is safe to run more than once.
--
-- What it sets up:
--   1. A PRIVATE storage bucket called "puzzles" with a file size cap and allowed types.
--   2. One rule: anyone (the public "anon" key) may ADD a file whose path looks like
--        <class folder>/<file name>.stl | .png | .json
--      Nobody can list, read, overwrite or delete through the public key.
--      Listing, downloading and deleting go through the Edge Function (16e), which
--      uses the service key on the server and checks the delete passcode.
--   3. A small table that counts wrong delete passcodes, locked away from the public key.
--   4. A tiny function the weekly keep-alive request calls so the free project does not pause.
--
-- Nothing secret is in this file. The delete passcode is NOT here: it is set as a
-- Supabase secret in the dashboard (see inbox/README.md).

-- 1. The bucket ------------------------------------------------------------
-- The size cap is 4 MB per file. Measured 2026-10-30: a 16-piece STL is 0.5 to 0.65 MB
-- (about 12,000 triangles), so 4 MB is about six times the largest seen.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'puzzles',
  'puzzles',
  false,
  4194304,
  array['model/stl', 'image/png', 'application/json']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2. Add-only rule ---------------------------------------------------------
-- Folder: the tidied class code (lower case letters, digits, - and _, 1 to 24 characters).
-- File:   plain ASCII name ending .stl, .png or .json (the exact animal name is in the JSON).
drop policy if exists "puzzles: anyone may add" on storage.objects;
create policy "puzzles: anyone may add"
  on storage.objects
  for insert
  to anon, authenticated
  with check (
    bucket_id = 'puzzles'
    and name ~ '^[a-z0-9_-]{1,24}/[A-Za-z0-9._() +-]{1,100}\.(stl|png|json)$'
  );

-- There is deliberately NO select, update or delete policy for anon, so those are refused.

-- 3. Wrong-passcode counter (used by the Edge Function in 16e) --------------
create table if not exists public.inbox_attempts (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  ok boolean not null
);
alter table public.inbox_attempts enable row level security;
revoke all on public.inbox_attempts from anon, authenticated;
-- Newer projects do not hand new tables to service_role by themselves, so say so.
grant all on public.inbox_attempts to service_role;
grant usage, select on sequence public.inbox_attempts_id_seq to service_role;
-- RLS is on and there are no policies, so only the service key (the Edge Function) can use it.

-- 4. Keep-alive ------------------------------------------------------------
create or replace function public.inbox_ping()
returns integer
language sql
security definer
set search_path = ''
as $$ select 1 $$;
revoke all on function public.inbox_ping() from public;
grant execute on function public.inbox_ping() to anon;
