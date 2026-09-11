# Portfolio CMS setup

> The production owner route is `/?studio=1`. It requires a configured Supabase
> project and an authenticated administrator. Local development without cloud
> configuration still supports a separate local preview; see
> [LOCAL_EDITOR.md](./LOCAL_EDITOR.md). Local saves never update the public site.

This project uses Supabase as a small, single-document CMS. The public site reads
one published JSON document; the admin UI edits one private draft and publishes
it through an atomic database function.

## Data model

| Resource | Singleton row | Purpose | Browser access |
| --- | --- | --- | --- |
| `public.site_content` | `id = 'published'` | Current public snapshot | Anyone can `select` |
| `public.site_drafts` | `id = 'main'` | Private working copy | Admin can read and save |
| `public.site_content_revisions` | One row per revision | Immutable publish history | Admin can read |
| Storage bucket `portfolio-assets` | — | Public website images | Public URL; admin manages files |

`content` is one versioned JSON document. Version 1 deliberately covers every
current section, while the browser and publish RPC both reject an incomplete
shape. When the portfolio gains a new structural section, update the defaults,
normalizer and SQL validation together. The current top-level shape is:

```json
{
  "schemaVersion": 1,
  "global": {},
  "opening": {},
  "hero": {},
  "profile": {},
  "work": { "projects": [] },
  "capabilities": { "items": [] },
  "contact": {}
}
```

## 1. Create or link a Supabase project

### Project image editing

The project editor has two media sections only:

- **项目封面**: one image URL (`image`), used on the public card and as the
  initial image in project details.
- **项目缩略图**: up to 20 additional images (`gallery`), excluding the cover.
  Batch upload, individual replacement, reordering and removal are supported.
  These images form the horizontal thumbnail strip beneath the detail image.

The old separate `详情图片` form is replaced by this thumbnail manager; existing
gallery records remain intact. Custom legacy `thumbnail` uploads are migrated
into the gallery without overwriting the cover. Built-in card-sized images are
only used while their original cover is selected, for loading performance.
Uploads never publish content automatically.

Apply `202609100001_project_media_limits.sql` along with the initial migration
to enforce the 20-image limit on Supabase draft saves and publication. The
editor and local saves enforce this limit as well. Legacy records over the
limit are preserved for review; remove extras before saving or publishing.

### Supabase setup

Install and authenticate the Supabase CLI, then link this repository to the
intended project. From the repository root, apply the migration:

```bash
supabase db push
```

Alternatively, copy
`supabase/migrations/202609080001_portfolio_cms.sql` into the Supabase SQL Editor
and run it once.

The migration:

- creates and seeds the published and draft singleton rows;
- enables RLS and replaces broad table grants with explicit grants;
- creates admin-only draft and revision policies;
- creates `save_site_draft` and `publish_site_content` RPCs;
- creates a public `portfolio-assets` image bucket with a 6 MB per-file limit;
- permits only administrators to list, upload, replace, move or delete assets.

Do not expose the `portfolio_private` schema in the Data API settings. It holds
the security-definer implementation behind the public invoker RPC.

## 2. Configure the administrator

Create the editor account under **Authentication → Users**. Set its trusted app
metadata to:

```json
{
  "role": "admin"
}
```

The authorization check is exactly the `role` value inside the JWT's
`app_metadata`. Do not put the role in `user_metadata`: users can edit their own
user metadata, so it is not appropriate for authorization.

Set app metadata only through the Supabase Dashboard or trusted server-side admin
tooling. After changing the role, sign out and sign in again (or refresh the
session) so the browser receives a new JWT. A role change is not visible to RLS
until the JWT is refreshed.

Under **Authentication → Sign In / Providers**, keep email/password enabled but
disable public user signups. Provision the single owner account from the
Dashboard. Also set the production **Site URL** and add
`https://YOUR_DOMAIN/?studio=1` to the redirect allow list. If the host is
configured for SPA rewrites, you can additionally allow
`https://YOUR_DOMAIN/studio`.

## 3. Add safe frontend configuration

Install the browser client when the CMS UI is added:

```bash
npm install @supabase/supabase-js
```

First ensure the repository `.gitignore` contains:

```gitignore
.env
.env.*
!.env.example
```

Then create a local `.env.local`:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Only use the project's publishable key in this Vite app. Never place a secret key
or a `service_role` key in a `VITE_*` variable, browser bundle, repository or
deployment log. The client intentionally rejects `sb_secret_*`, legacy
`service_role` JWTs, and non-local production HTTP URLs.

Vite injects environment variables at build time. Restart the development server
after changing `.env.local`, and rebuild the production site after changing
deployment variables.

Create the client:

```js
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
)
```

## 4. Public-site read

The portfolio needs one query at startup:

```js
const { data, error } = await supabase
  .from('site_content')
  .select('content, revision, published_at')
  .eq('id', 'published')
  .single()

if (error) throw error
```

Keep the current local content as a render fallback for network failures. The
published response can also be cached because it changes only after a publish.
The public loader releases the opening after 1.6 seconds if the request is slow,
but still applies a successful cloud response when it arrives. It aborts stalled
requests after 12 seconds and cancels updates on unmount. Publishing changes
content in Supabase; visitors receive it on their next page load or refresh.

## 5. Admin draft workflow

Sign the administrator in with Supabase Auth, then verify the client-side UI state
from `session.user.app_metadata.role`. This UI check is only for presentation;
the database remains the security boundary.

Read the draft and its base revision:

```js
const { data: draft, error } = await supabase
  .from('site_drafts')
  .select('content, base_revision, draft_version, updated_at')
  .eq('id', 'main')
  .single()

if (error) throw error
```

Save the working document:

```js
const { data: savedDraft, error } = await supabase.rpc('save_site_draft', {
  p_content: editedContent,
  p_expected_base_revision: draft.base_revision,
  p_expected_draft_version: draft.draft_version,
}).single()

if (error) throw error
```

Publish using the latest `base_revision` returned by the draft query or save:

```js
const { data: published, error } = await supabase.rpc('publish_site_content', {
  p_expected_base_revision: savedDraft.base_revision,
  p_expected_draft_version: savedDraft.draft_version,
}).single()

if (error) {
  // PostgreSQL 40001 means another publish won the race. Reload before retrying.
  if (error.code === '40001') await reloadDraft()
  else throw error
}
```

Saving and publishing both use atomic compare-and-swap checks. This prevents two
open Studio tabs from silently overwriting or publishing one another's draft.
Publishing locks the draft and published singleton rows, verifies both expected
versions, copies the JSON into `site_content`, increments the revision,
appends the same snapshot to history, and advances the draft base revision. These
changes commit or roll back together.

Read revision history:

```js
const { data: revisions, error } = await supabase
  .from('site_content_revisions')
  .select('revision, content, published_at, published_by')
  .order('revision', { ascending: false })
```

Revision rows have no browser `insert`, `update` or `delete` grant. A history row
is created only by a successful publish.

## 6. Asset workflow

Upload with a stable, collision-resistant path, for example
`projects/<project-id>/<timestamp>-<filename>`:

```js
const path = `projects/${projectId}/${Date.now()}-${file.name}`

const { data: upload, error } = await supabase.storage
  .from('portfolio-assets')
  .upload(path, file, {
    cacheControl: '3600',
    contentType: file.type,
    upsert: false,
  })

if (error) throw error

const { data: publicAsset } = supabase.storage
  .from('portfolio-assets')
  .getPublicUrl(upload.path)
```

Store `publicAsset.publicUrl` in the draft JSON. Use `upsert: true` only when the
editor intentionally replaces an existing path; upsert requires the admin
`select` and `update` policies included in the migration.

Uploads accept JPG, PNG, WebP and AVIF images up to 6 MB. The Hero background
video remains an editable external URL field rather than a browser upload.

The bucket is public, so an uploaded image URL is immediately retrievable even
before the site draft is published. Never
upload private documents, credentials, unpublished client material or personal
data to this bucket. Remove abandoned assets periodically from the Storage
dashboard.

## 7. Production routing

Production loads OwnerStudio lazily on the owner route. Without cloud
configuration it shows setup guidance, not editable controls. With configuration
it requires login and the server-managed admin claim. Never enable the local
development authentication bypass in a production build.

Use `https://YOUR_DOMAIN/?studio=1` as the portable owner URL. It works on static
hosts without a rewrite rule. The cleaner `/studio` alias is also supported; to
open or refresh that path directly, configure the host to rewrite unknown routes
to `/index.html`. Keep both owner URLs out of public navigation. Hiding a link is
only a UI choice—Supabase RLS and the admin claim remain the actual authorization
boundary.

## Permission matrix

| Operation | Signed out | Signed in, non-admin | Admin |
| --- | ---: | ---: | ---: |
| Read published JSON | Yes | Yes | Yes |
| Read/save draft | No | No | Yes |
| Publish | No | No | Yes |
| Read revision history | No | No | Yes |
| Retrieve an asset by public URL | Yes | Yes | Yes |
| List/upload/update/delete assets | No | No | Yes |

Postgres grants and RLS policies are both required for an operation to succeed.
The migration intentionally leaves `anon` without draft, history or RPC grants.
It does not alter table-wide grants on the shared `storage.objects` table, which
could affect unrelated buckets; the `portfolio-assets` write boundary is enforced
with bucket-scoped RLS policies.

## Verification checklist

1. With no session, confirm `site_content` is readable and `site_drafts` is not.
2. With a normal authenticated account, confirm draft reads and both RPCs fail.
3. With a refreshed admin session, save a JSON object and publish it.
4. Confirm `site_content.revision` increments and exactly one matching history row
   appears.
5. Call publish again with the old base revision and confirm error `40001`.
6. Confirm only an admin can upload, replace and delete an object.
7. Open the resulting public asset URL in a signed-out browser.

Relevant Supabase documentation:

- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Database functions and function privileges](https://supabase.com/docs/guides/database/functions)
- [Storage access control](https://supabase.com/docs/guides/storage/security/access-control)
- [Public and private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals)
