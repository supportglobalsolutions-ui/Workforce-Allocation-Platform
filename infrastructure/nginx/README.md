# Nginx notes

Production site config lives on the VPS as `/etc/nginx/sites-available/workforce-platform.conf`.
The copy in `docs/deployment.md` (Step 7) is the source of truth for new installs.

## Phase 1 Safety — Guacamole public API lockdown

File: [`guacamole-hardening.conf`](./guacamole-hardening.conf)

Paste those `location` blocks into the **guac.*** server block **before** `location /`,
then:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Also:

1. Confirm backend `.env` uses `GUACAMOLE_URL=http://127.0.0.1:8080/guacamole` (not the public hostname).
2. Rotate `guacadmin` password in Guacamole and update `GUACAMOLE_PASSWORD`.
3. Confirm Vercel no longer rewrites `/remote/*` (see `frontend/next.config.js`).

## Phase 5 — join-ticket gate on `guac.`

File: [`guacamole-join-ticket.conf`](./guacamole-join-ticket.conf)

Moves the canvas off FastAPI. A Guacamole token can only be minted by spending a
single-use ticket FastAPI issued for an open claim, and `guacamole-auth-json`
scopes that token to the one connection the worker claimed.

- The `map` goes at `http{}` level; the `location` blocks go in the **guac.***
  server block, before `location /`.
- Needs `GUACAMOLE_PUBLIC_URL` + `GUACAMOLE_JSON_SECRET_KEY` in the backend `.env`
  and the same key as `JSON_SECRET_KEY` on the Guacamole container.
- **This blocks the public Guacamole admin login** (that is the point) — reach it
  over `ssh -L 8080:127.0.0.1:8080` instead.
- Roll out with `RDP_DIRECT_GATEWAY_MODE=pilot` before `on`; workers outside the
  cohort keep the proxied tunnel with no change.

Full runbook: `docs/deployment.md` §7.4.
