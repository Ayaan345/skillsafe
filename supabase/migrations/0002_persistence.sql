-- SkillSafe persistence + sharing. Default-deny RLS on every table.
-- Anonymous scans are never written; only an explicit "save report" inserts.

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  created_at timestamptz not null default now()
);

create table if not exists public.scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  title text not null default 'Untitled skill',
  source_type text not null check (source_type in ('paste','file','zip','url')),
  status text not null default 'completed' check (status in ('pending','scanning','completed','failed')),
  verdict text check (verdict in ('SAFE','SUSPICIOUS','MALICIOUS')),
  label text,
  score integer check (score between 0 and 100),
  raw_score integer,
  catalog_version integer not null default 1,
  bundle_hash text,
  file_count integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists scans_user_created_idx on public.scans (user_id, created_at desc);

create table if not exists public.scan_files (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.scans(id) on delete cascade,
  filename text not null,
  sha256 text not null,
  size bigint not null check (size >= 0)
);
create index if not exists scan_files_scan_idx on public.scan_files (scan_id);

create table if not exists public.findings (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.scans(id) on delete cascade,
  rule_id text not null,
  category text not null,
  severity text not null check (severity in ('CRITICAL','HIGH','MEDIUM','LOW','INFO')),
  layer text,
  file text not null,
  line integer,
  start_offset integer,
  snippet text,
  why text not null,
  fix text not null,
  confidence real
);
create index if not exists findings_scan_idx on public.findings (scan_id);

create table if not exists public.saved_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  query text not null default '',
  severity text not null default '',
  sort text not null default 'severity',
  created_at timestamptz not null default now()
);

create table if not exists public.shares (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.scans(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.users(id) on delete set null,
  action text not null,
  target text,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email) values (new.id, coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.users       enable row level security;
alter table public.scans       enable row level security;
alter table public.scan_files  enable row level security;
alter table public.findings    enable row level security;
alter table public.saved_views enable row level security;
alter table public.shares      enable row level security;
alter table public.audit_log   enable row level security;

drop policy if exists users_read_self on public.users;
create policy users_read_self on public.users
  for select to authenticated using ((select auth.uid()) = id);

drop policy if exists scans_read_own on public.scans;
create policy scans_read_own on public.scans
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists scans_insert_own on public.scans;
create policy scans_insert_own on public.scans
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists scans_update_own on public.scans;
create policy scans_update_own on public.scans
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists scans_delete_own on public.scans;
create policy scans_delete_own on public.scans
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists findings_read_via_scan on public.findings;
create policy findings_read_via_scan on public.findings
  for select to authenticated using (
    exists (select 1 from public.scans s where s.id = findings.scan_id and s.user_id = (select auth.uid())));
drop policy if exists findings_insert_via_scan on public.findings;
create policy findings_insert_via_scan on public.findings
  for insert to authenticated with check (
    exists (select 1 from public.scans s where s.id = findings.scan_id and s.user_id = (select auth.uid())));
drop policy if exists findings_delete_via_scan on public.findings;
create policy findings_delete_via_scan on public.findings
  for delete to authenticated using (
    exists (select 1 from public.scans s where s.id = findings.scan_id and s.user_id = (select auth.uid())));

drop policy if exists scan_files_read_via_scan on public.scan_files;
create policy scan_files_read_via_scan on public.scan_files
  for select to authenticated using (
    exists (select 1 from public.scans s where s.id = scan_files.scan_id and s.user_id = (select auth.uid())));
drop policy if exists scan_files_insert_via_scan on public.scan_files;
create policy scan_files_insert_via_scan on public.scan_files
  for insert to authenticated with check (
    exists (select 1 from public.scans s where s.id = scan_files.scan_id and s.user_id = (select auth.uid())));

drop policy if exists views_owner_all on public.saved_views;
create policy views_owner_all on public.saved_views
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists shares_owner_all on public.shares;
create policy shares_owner_all on public.shares
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- audit_log: RLS enabled, zero policies => service role only.
