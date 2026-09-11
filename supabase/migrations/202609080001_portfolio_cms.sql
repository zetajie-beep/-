-- Portfolio CMS: one published document, one private draft, immutable revisions.
-- This migration is intended for Supabase Postgres.

begin;

create schema if not exists portfolio_private;

revoke all on schema portfolio_private from public, anon, authenticated;
grant usage on schema portfolio_private to authenticated;

create table if not exists public.site_content (
  id text primary key,
  content jsonb not null default '{}'::jsonb,
  revision bigint not null default 0,
  published_at timestamptz not null default now(),
  published_by uuid,
  constraint site_content_singleton check (id = 'published'),
  constraint site_content_object check (jsonb_typeof(content) = 'object'),
  constraint site_content_revision_nonnegative check (revision >= 0)
);

create table if not exists public.site_drafts (
  id text primary key,
  content jsonb not null default '{}'::jsonb,
  base_revision bigint not null default 0,
  draft_version bigint not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint site_drafts_singleton check (id = 'main'),
  constraint site_drafts_object check (jsonb_typeof(content) = 'object'),
  constraint site_drafts_base_revision_nonnegative check (base_revision >= 0),
  constraint site_drafts_version_nonnegative check (draft_version >= 0)
);

alter table public.site_drafts
add column if not exists draft_version bigint not null default 0;

create table if not exists public.site_content_revisions (
  id bigint generated always as identity primary key,
  content_id text not null default 'published',
  revision bigint not null,
  content jsonb not null,
  published_at timestamptz not null default now(),
  published_by uuid not null,
  constraint site_content_revisions_singleton check (content_id = 'published'),
  constraint site_content_revisions_object check (jsonb_typeof(content) = 'object'),
  constraint site_content_revisions_revision_positive check (revision > 0),
  constraint site_content_revisions_unique_revision unique (content_id, revision)
);

comment on table public.site_content is
  'The public portfolio document. Exactly one row exists: id = published.';
comment on table public.site_drafts is
  'The private CMS draft. Exactly one row exists: id = main.';
comment on table public.site_content_revisions is
  'Append-only snapshots created by publish_site_content.';

insert into public.site_content (id, content, revision)
values ('published', '{}'::jsonb, 0)
on conflict (id) do nothing;

insert into public.site_drafts (id, content, base_revision)
select 'main', content, revision
from public.site_content
where id = 'published'
on conflict (id) do nothing;

alter table public.site_content enable row level security;
alter table public.site_drafts enable row level security;
alter table public.site_content_revisions enable row level security;

-- Remove Supabase's broad defaults, then grant only the operations the browser needs.
revoke all on table public.site_content from anon, authenticated;
revoke all on table public.site_drafts from anon, authenticated;
revoke all on table public.site_content_revisions from anon, authenticated;

grant select on table public.site_content to anon, authenticated;
grant select on table public.site_drafts to authenticated;
grant select on table public.site_content_revisions to authenticated;

drop policy if exists site_content_public_read on public.site_content;
create policy site_content_public_read
on public.site_content
for select
to anon, authenticated
using (id = 'published');

drop policy if exists site_drafts_admin_read on public.site_drafts;
create policy site_drafts_admin_read
on public.site_drafts
for select
to authenticated
using (
  id = 'main'
  and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
);

drop policy if exists site_drafts_admin_update on public.site_drafts;
create policy site_drafts_admin_update
on public.site_drafts
for update
to authenticated
using (
  id = 'main'
  and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
)
with check (
  id = 'main'
  and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
);

drop policy if exists site_content_revisions_admin_read on public.site_content_revisions;
create policy site_content_revisions_admin_read
on public.site_content_revisions
for select
to authenticated
using (
  content_id = 'published'
  and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
);

drop function if exists public.save_site_draft(jsonb);

-- Saving is an atomic compare-and-swap. Direct table updates are not granted to
-- browser roles, so audit fields and versions can only be changed here.
create or replace function public.save_site_draft(
  p_content jsonb,
  p_expected_base_revision bigint,
  p_expected_draft_version bigint
)
returns public.site_drafts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft public.site_drafts%rowtype;
begin
  if (select auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'admin' then
    raise exception using
      errcode = '42501',
      message = 'Administrator access is required to save the portfolio draft.';
  end if;

  if p_content is null or jsonb_typeof(p_content) is distinct from 'object' then
    raise exception using
      errcode = '22023',
      message = 'Draft content must be a JSON object.';
  end if;

  if p_expected_base_revision is null or p_expected_base_revision < 0
     or p_expected_draft_version is null or p_expected_draft_version < 0 then
    raise exception using
      errcode = '22023',
      message = 'Expected draft versions must be non-negative integers.';
  end if;

  if p_content -> 'schemaVersion' is distinct from '1'::jsonb
     or jsonb_typeof(p_content -> 'global') is distinct from 'object'
     or jsonb_typeof(p_content -> 'global' -> 'navItems') is distinct from 'array'
     or jsonb_typeof(p_content -> 'opening') is distinct from 'object'
     or jsonb_typeof(p_content -> 'hero') is distinct from 'object'
     or jsonb_typeof(p_content -> 'hero' -> 'titleLines') is distinct from 'array'
     or jsonb_typeof(p_content -> 'work') is distinct from 'object'
     or jsonb_typeof(p_content -> 'work' -> 'projects') is distinct from 'array'
     or jsonb_typeof(p_content -> 'profile') is distinct from 'object'
     or jsonb_typeof(p_content -> 'profile' -> 'statementParts') is distinct from 'array'
     or jsonb_typeof(p_content -> 'profile' -> 'metrics') is distinct from 'array'
     or jsonb_typeof(p_content -> 'profile' -> 'experience') is distinct from 'array'
     or jsonb_typeof(p_content -> 'capabilities') is distinct from 'object'
     or jsonb_typeof(p_content -> 'capabilities' -> 'items') is distinct from 'array'
     or jsonb_typeof(p_content -> 'contact') is distinct from 'object'
     or jsonb_typeof(p_content -> 'contact' -> 'links') is distinct from 'array' then
    raise exception using
      errcode = '22023',
      message = 'Draft content does not match portfolio schema version 1.';
  end if;

  update public.site_drafts
  set
    content = p_content,
    draft_version = draft_version + 1,
    updated_at = statement_timestamp(),
    updated_by = (select auth.uid())
  where id = 'main'
    and base_revision = p_expected_base_revision
    and draft_version = p_expected_draft_version
  returning * into v_draft;

  if not found then
    raise exception using
      errcode = '40001',
      message = 'The portfolio draft changed in another editor.',
      hint = 'Reload the CMS data before saving again.';
  end if;

  return v_draft;
end;
$$;

revoke all on function public.save_site_draft(jsonb, bigint, bigint) from public, anon, authenticated;
grant execute on function public.save_site_draft(jsonb, bigint, bigint) to authenticated;

-- The mutation lives outside the exposed public schema. It checks the JWT itself,
-- pins search_path, locks both singleton rows and publishes in one transaction.
drop function if exists public.publish_site_content(bigint);
drop function if exists portfolio_private.publish_site_content_impl(bigint);

create or replace function portfolio_private.publish_site_content_impl(
  p_expected_base_revision bigint,
  p_expected_draft_version bigint
)
returns table (
  revision bigint,
  content jsonb,
  published_at timestamptz,
  draft_version bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_published public.site_content%rowtype;
  v_draft public.site_drafts%rowtype;
  v_next_revision bigint;
  v_next_draft_version bigint;
  v_published_at timestamptz := statement_timestamp();
  v_published_by uuid := (select auth.uid());
begin
  if (select auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'admin' then
    raise exception using
      errcode = '42501',
      message = 'Administrator access is required to publish the portfolio.';
  end if;

  if p_expected_base_revision is null or p_expected_base_revision < 0
     or p_expected_draft_version is null or p_expected_draft_version < 0 then
    raise exception using
      errcode = '22023',
      message = 'Expected publish versions must be non-negative integers.';
  end if;

  select sc.*
  into v_published
  from public.site_content as sc
  where sc.id = 'published'
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'The published portfolio row does not exist.';
  end if;

  select sd.*
  into v_draft
  from public.site_drafts as sd
  where sd.id = 'main'
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'The main portfolio draft does not exist.';
  end if;

  if p_expected_base_revision <> v_draft.base_revision
     or p_expected_draft_version <> v_draft.draft_version
     or v_draft.base_revision <> v_published.revision then
    raise exception using
      errcode = '40001',
      message = 'The draft is based on an outdated published revision.',
      detail = format(
        'Expected base revision %s, expected draft version %s, draft base revision %s, draft version %s, current published revision %s.',
        p_expected_base_revision,
        p_expected_draft_version,
        v_draft.base_revision,
        v_draft.draft_version,
        v_published.revision
      ),
      hint = 'Reload the CMS data before publishing again.';
  end if;

  if v_draft.content -> 'schemaVersion' is distinct from '1'::jsonb
     or jsonb_typeof(v_draft.content -> 'global') is distinct from 'object'
     or jsonb_typeof(v_draft.content -> 'global' -> 'navItems') is distinct from 'array'
     or jsonb_typeof(v_draft.content -> 'opening') is distinct from 'object'
     or jsonb_typeof(v_draft.content -> 'hero') is distinct from 'object'
     or jsonb_typeof(v_draft.content -> 'hero' -> 'titleLines') is distinct from 'array'
     or jsonb_typeof(v_draft.content -> 'work') is distinct from 'object'
     or jsonb_typeof(v_draft.content -> 'work' -> 'projects') is distinct from 'array'
     or jsonb_typeof(v_draft.content -> 'profile') is distinct from 'object'
     or jsonb_typeof(v_draft.content -> 'profile' -> 'statementParts') is distinct from 'array'
     or jsonb_typeof(v_draft.content -> 'profile' -> 'metrics') is distinct from 'array'
     or jsonb_typeof(v_draft.content -> 'profile' -> 'experience') is distinct from 'array'
     or jsonb_typeof(v_draft.content -> 'capabilities') is distinct from 'object'
     or jsonb_typeof(v_draft.content -> 'capabilities' -> 'items') is distinct from 'array'
     or jsonb_typeof(v_draft.content -> 'contact') is distinct from 'object'
     or jsonb_typeof(v_draft.content -> 'contact' -> 'links') is distinct from 'array' then
    raise exception using
      errcode = '22023',
      message = 'Draft content does not match portfolio schema version 1.';
  end if;

  v_next_revision := v_published.revision + 1;
  v_next_draft_version := v_draft.draft_version + 1;

  update public.site_content
  set
    content = v_draft.content,
    revision = v_next_revision,
    published_at = v_published_at,
    published_by = v_published_by
  where id = 'published';

  insert into public.site_content_revisions (
    content_id,
    revision,
    content,
    published_at,
    published_by
  )
  values (
    'published',
    v_next_revision,
    v_draft.content,
    v_published_at,
    v_published_by
  );

  update public.site_drafts
  set
    base_revision = v_next_revision,
    draft_version = v_next_draft_version,
    updated_at = v_published_at,
    updated_by = v_published_by
  where id = 'main';

  return query
  select v_next_revision, v_draft.content, v_published_at, v_next_draft_version;
end;
$$;

revoke all on function portfolio_private.publish_site_content_impl(bigint, bigint)
from public, anon, authenticated;
grant execute on function portfolio_private.publish_site_content_impl(bigint, bigint)
to authenticated;

-- Public RPC wrapper. It remains SECURITY INVOKER and delegates only after the
-- private implementation has independently verified the admin app_metadata claim.
create or replace function public.publish_site_content(
  p_expected_base_revision bigint,
  p_expected_draft_version bigint
)
returns table (
  revision bigint,
  content jsonb,
  published_at timestamptz,
  draft_version bigint
)
language sql
security invoker
set search_path = ''
as $$
  select *
  from portfolio_private.publish_site_content_impl(
    p_expected_base_revision,
    p_expected_draft_version
  );
$$;

revoke all on function public.publish_site_content(bigint, bigint)
from public, anon, authenticated;
grant execute on function public.publish_site_content(bigint, bigint)
to authenticated;

-- Public portfolio media. Public buckets bypass RLS for serving object URLs;
-- object listing and every write operation remain protected below.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'portfolio-assets',
  'portfolio-assets',
  true,
  6291456,
  array[
    'image/avif',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]::text[]
)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Restrictive gate: even if another permissive Storage policy is added later,
-- it cannot grant a non-admin write or metadata listing inside this bucket.
drop policy if exists portfolio_assets_admin_gate on storage.objects;
create policy portfolio_assets_admin_gate
on storage.objects
as restrictive
for all
to anon, authenticated
using (
  bucket_id <> 'portfolio-assets'
  or (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
)
with check (
  bucket_id <> 'portfolio-assets'
  or (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
);

drop policy if exists portfolio_assets_admin_list on storage.objects;
create policy portfolio_assets_admin_list
on storage.objects
for select
to authenticated
using (
  bucket_id = 'portfolio-assets'
  and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
);

drop policy if exists portfolio_assets_admin_insert on storage.objects;
create policy portfolio_assets_admin_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'portfolio-assets'
  and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
);

drop policy if exists portfolio_assets_admin_update on storage.objects;
create policy portfolio_assets_admin_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'portfolio-assets'
  and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
)
with check (
  bucket_id = 'portfolio-assets'
  and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
);

drop policy if exists portfolio_assets_admin_delete on storage.objects;
create policy portfolio_assets_admin_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'portfolio-assets'
  and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
);

commit;
