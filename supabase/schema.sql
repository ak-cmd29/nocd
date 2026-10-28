-- NOCD Intake Agent AI Knowledge Check: database schema.
-- Idempotent: safe to re-run in the Supabase SQL editor.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  role text not null default 'agent' check (role in ('manager', 'agent')),
  created_at timestamptz not null default now()
);

create table if not exists public.knowledge_checks (
  id uuid primary key default gen_random_uuid(),
  manager_id uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  topic text not null,
  reference_material text not null,
  questions jsonb not null check (jsonb_typeof(questions) = 'array'),
  created_at timestamptz not null default now()
);

create table if not exists public.attempts (
  id uuid primary key default gen_random_uuid(),
  check_id uuid not null references public.knowledge_checks (id) on delete cascade,
  agent_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  audio_urls jsonb not null default '[]'::jsonb check (jsonb_typeof(audio_urls) = 'array'),
  transcripts jsonb not null default '[]'::jsonb check (jsonb_typeof(transcripts) = 'array'),
  evaluation jsonb not null default '[]'::jsonb check (jsonb_typeof(evaluation) = 'array'),
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  created_at timestamptz not null default now()
);

create index if not exists knowledge_checks_manager_id_idx on public.knowledge_checks (manager_id);
create index if not exists attempts_agent_id_idx on public.attempts (agent_id);
create index if not exists attempts_check_id_idx on public.attempts (check_id);

-- ---------------------------------------------------------------------------
-- Table privileges
-- Newer Supabase projects do not auto-grant API roles access to tables created
-- in SQL. RLS policies below further restrict what 'authenticated' can touch.
-- ---------------------------------------------------------------------------

revoke all on public.profiles, public.knowledge_checks, public.attempts from anon;
grant select on public.profiles to authenticated;
grant select, insert on public.knowledge_checks to authenticated;
grant select, insert on public.attempts to authenticated;
grant select, insert, update, delete on public.profiles, public.knowledge_checks, public.attempts to service_role;

-- ---------------------------------------------------------------------------
-- Role helpers
-- SECURITY DEFINER so policies can read profiles without recursing into
-- the profiles RLS policies.
-- ---------------------------------------------------------------------------

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_user_role() = 'manager', false);
$$;

create or replace function public.is_agent()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_user_role() = 'agent', false);
$$;

-- Attempts that consume one of an agent's 3 tries on a check. Failed attempts and
-- 'processing' attempts older than 10 minutes (abandoned) do not count.
-- Mirrors countsTowardLimit() in src/lib/assessment/attempts.ts.
create or replace function public.count_used_attempts(target_check_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.attempts
  where agent_id = auth.uid()
    and check_id = target_check_id
    and (
      status = 'completed'
      or (status = 'processing' and created_at > now() - interval '10 minutes')
    );
$$;

revoke all on function public.count_used_attempts(uuid) from public, anon;
grant execute on function public.count_used_attempts(uuid) to authenticated;

revoke all on function public.current_user_role() from public, anon;
revoke all on function public.is_manager() from public, anon;
revoke all on function public.is_agent() from public, anon;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_manager() to authenticated;
grant execute on function public.is_agent() to authenticated;

-- ---------------------------------------------------------------------------
-- Auto-create a profile on sign-up
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- app_metadata is writable only with the service role; user_metadata is client-controlled
  -- at sign-up, so reading it would let anyone self-register as a manager.
  requested_role text := new.raw_app_meta_data ->> 'role';
begin
  insert into public.profiles (id, email, role)
  values (
    new.id,
    new.email,
    case when requested_role in ('manager', 'agent') then requested_role else 'agent' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.knowledge_checks enable row level security;
alter table public.attempts enable row level security;

-- profiles: users see their own profile; managers see everyone.
-- No insert/update/delete policies: profiles are written only by the trigger
-- or the service role, so users cannot escalate their own role.
drop policy if exists "profiles_select_own_or_manager" on public.profiles;
create policy "profiles_select_own_or_manager"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.is_manager());

-- knowledge_checks: readable and insertable only by managers. Rows contain grading
-- criteria and sample answers, so agents never read this table directly; the server
-- serves them topic and prompts only, via the service role.
drop policy if exists "knowledge_checks_select_authenticated" on public.knowledge_checks;
drop policy if exists "knowledge_checks_select_manager" on public.knowledge_checks;
create policy "knowledge_checks_select_manager"
  on public.knowledge_checks for select
  to authenticated
  using (public.is_manager());

drop policy if exists "knowledge_checks_insert_manager" on public.knowledge_checks;
create policy "knowledge_checks_insert_manager"
  on public.knowledge_checks for insert
  to authenticated
  with check (public.is_manager() and manager_id = auth.uid());

-- attempts: agents insert their own, empty and 'processing', within the 3-attempt limit;
-- readable by the owning agent and managers.
-- No update policy: transcripts, evaluation, and status are written server-side
-- with the service role so agents cannot alter their own scores.
drop policy if exists "attempts_insert_own_agent" on public.attempts;
create policy "attempts_insert_own_agent"
  on public.attempts for insert
  to authenticated
  with check (
    public.is_agent()
    and agent_id = auth.uid()
    and status = 'processing'
    and audio_urls = '[]'::jsonb
    and transcripts = '[]'::jsonb
    and evaluation = '[]'::jsonb
    and public.count_used_attempts(check_id) < 3
  );

drop policy if exists "attempts_select_own_or_manager" on public.attempts;
create policy "attempts_select_own_or_manager"
  on public.attempts for select
  to authenticated
  using (agent_id = auth.uid() or public.is_manager());

-- ---------------------------------------------------------------------------
-- Storage: 'recordings' bucket (public read)
-- Object paths must be 'attempts/<attempt id>/q<1|2|3>.<webm|mp4>', where the attempt
-- belongs to the uploading agent and is still processing.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recordings', 'recordings', true, 26214400, array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "recordings_public_read" on storage.objects;
create policy "recordings_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'recordings');

drop policy if exists "recordings_insert_own_folder" on storage.objects;
drop policy if exists "recordings_insert_own_attempt" on storage.objects;
create policy "recordings_insert_own_attempt"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'recordings'
    and public.is_agent()
    and array_length(storage.foldername(name), 1) = 2
    and (storage.foldername(name))[1] = 'attempts'
    and storage.filename(name) in ('q1.webm', 'q2.webm', 'q3.webm', 'q1.mp4', 'q2.mp4', 'q3.mp4')
    and exists (
      select 1
      from public.attempts a
      where a.id::text = (storage.foldername(name))[2]
        and a.agent_id = auth.uid()
        and a.status = 'processing'
    )
  );
