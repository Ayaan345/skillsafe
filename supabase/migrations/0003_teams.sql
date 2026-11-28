create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','member')),
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table if not exists public.team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin','member')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.scans add column if not exists team_id uuid references public.teams(id) on delete set null;

create or replace function public.team_role(t uuid)
returns text language sql security definer set search_path = public stable as $$
  select role from public.team_members where team_id = t and user_id = auth.uid()
$$;
revoke all on function public.team_role(uuid) from public, anon;
grant execute on function public.team_role(uuid) to authenticated;

create or replace function public.add_team_owner_member()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.team_members (team_id, user_id, role) values (new.id, new.owner_id, 'owner');
  return new;
end $$;

drop trigger if exists add_team_owner_member on public.teams;
create trigger add_team_owner_member after insert on public.teams
  for each row execute function public.add_team_owner_member();

create or replace function public.accept_team_invite(invite_token_hash text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  invite public.team_invites%rowtype;
  account_email text;
begin
  if auth.uid() is null then return false; end if;

  select email into account_email from auth.users where id = auth.uid();
  if account_email is null then return false; end if;

  select * into invite
  from public.team_invites
  where token_hash = invite_token_hash and accepted_at is null and expires_at > now()
  for update;
  if not found or lower(invite.email) <> lower(account_email) then return false; end if;

  insert into public.team_members (team_id, user_id, role)
  values (invite.team_id, auth.uid(), invite.role)
  on conflict (team_id, user_id) do nothing;

  update public.team_invites set accepted_at = now() where id = invite.id;
  return true;
end $$;
revoke all on function public.accept_team_invite(text) from public, anon;
grant execute on function public.accept_team_invite(text) to authenticated;

alter table public.teams        enable row level security;
alter table public.team_members enable row level security;
alter table public.team_invites enable row level security;

drop policy if exists users_read_team_members on public.users;
create policy users_read_team_members on public.users for select to authenticated using (
  id = (select auth.uid()) or exists (
    select 1 from public.team_members member
    where member.user_id = users.id and public.team_role(member.team_id) is not null
  ));

drop policy if exists teams_read on public.teams;
create policy teams_read on public.teams for select to authenticated using (public.team_role(id) is not null);
drop policy if exists teams_insert on public.teams;
create policy teams_insert on public.teams for insert to authenticated with check ((select auth.uid()) = owner_id);
drop policy if exists teams_delete on public.teams;
create policy teams_delete on public.teams for delete to authenticated using (public.team_role(id) = 'owner');

drop policy if exists members_read on public.team_members;
create policy members_read on public.team_members for select to authenticated using (public.team_role(team_id) is not null);
drop policy if exists members_insert on public.team_members;
create policy members_insert on public.team_members for insert to authenticated with check (
  user_id <> (select auth.uid()) and (
    (public.team_role(team_id) = 'owner' and role in ('admin','member')) or
    (public.team_role(team_id) = 'admin' and role = 'member')
  ));
drop policy if exists members_update on public.team_members;
create policy members_update on public.team_members for update to authenticated
  using (user_id <> (select auth.uid()) and role <> 'owner' and public.team_role(team_id) in ('owner','admin'))
  with check (user_id <> (select auth.uid()) and role in ('admin','member') and public.team_role(team_id) in ('owner','admin'));
drop policy if exists members_delete on public.team_members;
create policy members_delete on public.team_members for delete to authenticated using (
  role <> 'owner' and (
    public.team_role(team_id) in ('owner','admin') or user_id = (select auth.uid())
  ));

drop policy if exists invites_all on public.team_invites;
create policy invites_all on public.team_invites for all to authenticated
  using (public.team_role(team_id) in ('owner','admin'))
  with check (public.team_role(team_id) in ('owner','admin'));

drop policy if exists scans_read_own on public.scans;
create policy scans_read_own on public.scans for select to authenticated using (
  (select auth.uid()) = user_id or (team_id is not null and public.team_role(team_id) is not null));

drop policy if exists scans_update_own on public.scans;
create policy scans_update_own on public.scans for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and (team_id is null or public.team_role(team_id) is not null));

drop policy if exists findings_read_via_scan on public.findings;
create policy findings_read_via_scan on public.findings for select to authenticated using (
  exists (select 1 from public.scans s where s.id = findings.scan_id
    and (s.user_id = (select auth.uid()) or public.team_role(s.team_id) is not null)));
