-- Enforce the same independent cover/gallery model on owner writes.
-- Existing documents are not rewritten or truncated by this migration.
create or replace function portfolio_private.validate_project_media()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_project jsonb;
begin
  if jsonb_typeof(new.content -> 'work' -> 'projects') = 'array' then
    for v_project in select value from jsonb_array_elements(new.content -> 'work' -> 'projects') loop
      if jsonb_typeof(v_project -> 'image') is distinct from 'string'
         or jsonb_typeof(v_project -> 'gallery') is distinct from 'array' then
        raise exception using errcode = '22023', message = 'Each project requires one cover URL and a separate gallery array.';
      end if;
      if jsonb_array_length(v_project -> 'gallery') > 20 then
        raise exception using errcode = '22023', message = 'A project gallery may contain at most 20 images, excluding its cover.';
      end if;
    end loop;
  end if;
  return new;
end;
$$;

revoke all on function portfolio_private.validate_project_media() from public, anon, authenticated;

drop trigger if exists validate_project_media on public.site_drafts;
create trigger validate_project_media
before insert or update of content on public.site_drafts
for each row execute function portfolio_private.validate_project_media();

drop trigger if exists validate_project_media on public.site_content;
create trigger validate_project_media
before insert or update of content on public.site_content
for each row execute function portfolio_private.validate_project_media();
