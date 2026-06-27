# Deploying LiteBoard Cloud to the studio server

LiteBoard's client is **100% static files** (`web/`) and the backend (Supabase) is **already
cloud-hosted**. So "deploying" the client = serving the `web/` folder over HTTPS on the studio
server. Redeploying new client code **never touches the boards** — they live in Supabase, not in
the code. That's what makes this safe to evolve continuously.

## Phased plan

- **Phase 1 — now (this doc):** serve the static client on the studio server, keep Supabase on the
  existing hosted project (`config.js` already points at it). Gives a shareable HTTPS link fast,
  no data migration.
- **Phase 2 — later (full M6):** self-host Supabase on the studio server (Docker), swap email login
  for **Azure AD SSO**, set up SSL + backups, then repoint `config.js` to the self-hosted URL/key
  and migrate the data. Independent of Phase 1 and can happen without breaking existing boards.

---

## Server layout (versioned, with instant rollback)

This is the "maintain version / never break what's pushed" guarantee. Each release is a frozen
checkout; a `current` symlink points at the live one. Switching versions = repointing the symlink
(atomic), and rollback = pointing it back.

```
/srv/liteboard/
  releases/
    v1.0.0/        # git checkout of tag v1.0.0  (full repo; web/ is what gets served)
    v1.1.0/        # next release
  current  ->  releases/v1.1.0      # symlink to the active release
```

The web server's document root is `/srv/liteboard/current/web`.

### First deploy

```bash
# one-time
sudo mkdir -p /srv/liteboard/releases
cd /srv/liteboard/releases
git clone <GITHUB_REPO_URL> v1.0.0          # or: git clone --branch v1.0.0 <URL> v1.0.0
ln -sfn /srv/liteboard/releases/v1.0.0 /srv/liteboard/current
```

`config.local.js` is gitignored, so it is **never** on the server — teammates get the real login
screen (correct). Do not copy it up.

### Deploy a new version (the "regular update push")

```bash
cd /srv/liteboard/releases
git clone --branch v1.1.0 <GITHUB_REPO_URL> v1.1.0     # or fetch+checkout the tag into a new dir
ln -sfn /srv/liteboard/releases/v1.1.0 /srv/liteboard/current   # atomic switch — live instantly
```

Static files, so no service restart is needed; Caddy/nginx serve the new files immediately.

### Roll back (if a release misbehaves)

```bash
ln -sfn /srv/liteboard/releases/v1.0.0 /srv/liteboard/current   # back to the previous version
```

Because boards are data in Supabase, rollback is always safe — you only revert the viewer code.

---

## Web server

Two options under `deploy/`. **Caddy is recommended** (automatic HTTPS, one file).

- `deploy/Caddyfile` — Caddy config. Replace the hostname, then `caddy run --config deploy/Caddyfile`
  (or install as a service). Caddy fetches a Let's Encrypt cert automatically.
- `deploy/nginx.conf` — nginx alternative (pair with certbot for TLS).

Both mirror the dev server's `no-store` caching so every deploy shows on reload (this app has a
known stale-bundle sensitivity — we trade bandwidth for always-fresh on an internal tool), and both
hard-404 `config.local.js` as a belt-and-suspenders against ever serving dev credentials.

Board link to share: `https://<your-host>/board.html?id=<boardId>`

---

## Releases & versioning

- Tag every shared version on `main`: `git tag -a v1.1.0 -m "..." && git push origin v1.1.0`.
- Deploy **by tag** (not a moving branch) so each shared link is reproducible and rollback is exact.
- The `releases/<tag>` + `current` symlink layout keeps prior versions on disk — if you ever make a
  genuinely breaking change, old boards can be pinned to the older release dir until migrated.

## Three rules so an update never breaks existing boards

1. **Client stays backward-compatible with old board docs.** Only *add* fields to the board doc
   format; never rename/remove fields existing boards rely on. Then any client version opens any
   board ever pushed.
2. **Database changes are additive only.** New nullable columns / new tables = safe. Renaming or
   dropping columns is the one thing that corrupts stored boards — avoid destructive migrations.
3. **Smoke-test a new release against a real old board** before repointing `current`. Check out the
   new tag into its release dir, open an existing board against it, confirm it renders, then switch.

## Team access (Supabase Auth)

Teammates each need a Supabase account and access to a board, or RLS shows "board not found".
Phase 1: invite them via the Supabase dashboard or board "Share / hand off". Phase 2: Azure AD SSO
makes this their normal studio login.
