# ANBU BLACK OPS

Shared-data operative roster. Edits made by any operative are saved to a **backend** and are visible to everyone who visits the site — no more "changes only show on my computer".

## How it works

- `server.js` — Express server that serves the static site **and** the `/api` backend from one port.
- `lib/store.js` — persistence layer with three interchangeable backends:
  - **Supabase (default, always on)**: the embedded project URL + publishable key from `lib/config.js` activate on EVERY deployment (localhost, Vercel, Render, the online preview) — no env vars needed. All data — members, profile photos, report images, APKs, news — lives in one shared `anbu_store` key/value table, so anything saved by one visitor is instantly visible to everyone else. Create the table by running `supabase-setup.sql` once in the Supabase dashboard SQL editor.
  - **Local / preview**: `data/db.json` is only used when Supabase is unreachable or explicitly disabled (e.g. `SUPABASE_KEY=""`). It is created automatically as a fallback.
  - **Vercel KV / Upstash Redis**: still supported when `KV_REST_API_URL` / `KV_REST_API_TOKEN` are present (takes priority only when no Supabase key is available).
- `api/index.js` — serverless entry used by Vercel (same app, no extra config).
- `js/api.js` — frontend API client. All profile/photo/project changes go through `/api/*`, so every browser sees the same data.

## Access control

| Who | What they can do |
| --- | --- |
| **Admin** (password `@820069`) | Edit any operative's name, rank, role, bio, field report, and photo. Set any operative's password directly (no current password needed). Create/edit/delete any project. View or set every operative's individual password from the dashboard's **Access Passwords** panel. |
| **Operative** (own card password) | Edit their own name, bio, field report, and profile photo. Change their own password (knowing the current one). Create/edit/delete their own projects. Rank and role stay locked. |
| **Visitor** | Read everything. Cannot edit or change anything without a password. |

Default card passwords are `anbu-01` … `anbu-06` (in roster order) — one individual password per operative. The admin can view and hand out every operative's password from the dashboard's **Access Passwords** panel, or set a fresh one for any operative directly.

## New features

- **App / Web project uploads** — when creating or editing a mission file the operative picks a **Project Type**:
  - **App (APK)**: upload the APK file (max **250 MB**) + description + screenshots (images in the report). Everyone gets a **Download APK** button on the home menu, dashboard and profile cards.
  - **Website**: paste the URL instead — the APK area hides itself. Cards get a web icon + **Visit Site** link that opens in a new tab.
  - Titles auto-fill from the APK filename or the site's domain, so cards never show a generic "New Mission" name.
   - Big note: large APK uploads work on the local Node server. Vercel serverless caps request bodies at a few MB — for full 250 MB uploads use the local server or Render. Data persistence comes from the Supabase backend (see Deploy).
- **Operative Dashboard** (`dashboard.html`) — every operative opens the war room from the footer button on the main menu, signs in with their own card password (or the admin password), and manages their mission files: create, edit, delete. Sessions carry over to the editor pages, and admins can switch between operatives from one dropdown.
- **Mission Files on the main menu** — a `Deployed Projects` section on `index.html` automatically lists every project uploaded by any operative, with type badges (App/Web), owner name + division, download/visit actions, newest first.
- **Command Directory** — a contact section on the home page with tap-to-call phone numbers for the commander and all five divisions.
- **Profile photo** — every operative can now change their own photo with their own password (admin too).
- **Mission Files (projects)** — a section between the self-introduction and the field report.

## Data durability

- The local file backend (`data/db.json`) never caches in memory: every read hits disk and every write is serialized through read → mutate → atomic rename (temp file + rename). A second server process or manual edit of `db.json` can no longer wipe uploaded images or APKs.
- Unlocks are held in memory only (`js/api.js`): navigating to any page or reloading locks everything again — every open asks for the password anew.
  - A `+ Add Project` card asks for the owner's or admin's password, then opens a blank mission file.
  - Each mission file has an editable **project name**, **introduction**, and a **report** with image support.
  - Images are added with the **+ Add Image** button and an alignment picker (Left / Center / Right / Full width). The alignment lives in the report markup itself:
    - `![left|Prototype photo](data:image/png;base64,...)`
    - `![right|caption](url)`, `![center|…]`, `![full|…]`
  - **Save** at the bottom publishes the file. Saved mission files appear below the field report, are visible to everyone, and can only be edited by their owner (with password) or the admin.
  - Project cards auto-align in a responsive grid.

## Run locally

```bash
npm install
npm start
# open http://localhost:3001
```

## Deploy (so everyone sees the changes)

1. Push this repo to GitHub and import it into your host (Vercel: framework preset **Other**; Render: **Web Service**, start command `npm start`).
2. **One-time Supabase setup**:
   - Open https://supabase.com/dashboard → project `mdjunotrttklmsgkrkwd` → **SQL Editor → New query**.
   - Paste the whole contents of `supabase-setup.sql` and press **RUN**. This creates the `anbu_store` table, grants the API roles access, and enables the row-level-security policy — photos, report images, APKs and every other field are stored in it and shared by all visitors.
   - That's it — the Supabase URL + publishable key from `lib/config.js` are active on every deployment by default. (Optionally set `SUPABASE_URL` / `SUPABASE_KEY` env vars yourself to override.)
3. Redeploy. Everything now persists in Supabase and is shared across all visitors. Check the storage mode any time at `/api/health` (`"supabase"` = persistent shared database).

> The key in `lib/config.js` is a Supabase **publishable** key — public by design and safe in the repo. Never put a secret `service_role` key there.

### Vercel note about big APKs
Large APK uploads work on the local Node server, but Vercel serverless caps request bodies at a few MB. For full 250 MB APK uploads use the local server or a host without body limits (Render).
