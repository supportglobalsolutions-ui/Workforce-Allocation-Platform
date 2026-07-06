# Backend Setup Guide
## GlobalSolutions — Kelvin's Personal Guide

---

## What you need installed first

| Tool | Why | Download |
|------|-----|----------|
| Python 3.12+ | Runs the backend | python.org |
| PostgreSQL 15+ | Main database | postgresql.org |
| Docker Desktop | Runs Redis, Guacamole, Uptime Kuma | docker.com/products/docker-desktop |
| Git | Version control | git-scm.com |

> Install all four before continuing. Restart your PC after Docker Desktop installs.

---

## What is Guacamole? Do I need an account?

No. You do not create any account anywhere.

Guacamole is a free program that runs on your own computer inside Docker.
It lets workers open a Windows desktop in their browser — no Remote Desktop app needed on their side.

Guacamole has a built-in admin panel with a default login:
- Username: `guacadmin`
- Password: `guacadmin`

This is only for you to configure it on your own machine. It is not an online service.

Your actual Windows RDP machine (the one workers connect to) has its own IP address,
Windows username, and Windows password. You type those directly into Guacamole
when you register the connection — covered in full below.

---

## FIRST TIME ONLY — Do these once, never again

---

### 1. Set up the Python virtual environment

```powershell
cd C:\PROJECTS\Workforce-Allocation-Platform\backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

Your terminal prompt should show `(venv)` at the start.
You must activate the venv every time you open a new terminal before running the backend.

If a package fails to build — your Python version is too new for that package's pre-built wheel.
Make sure you are on Python 3.12+.

---

### 2. Set up your .env file

```powershell
copy .env.example .env
```

Open `.env` and fill in your values:

```env
# App
ENVIRONMENT=development
ALLOWED_ORIGINS=http://localhost:3000

# PostgreSQL — must match your local PostgreSQL setup
DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/workforceallocationdb

# Redis — leave as-is if using Docker setup below
REDIS_URL=redis://localhost:6379/0

# Guacamole — leave as-is if using Docker setup below
GUACAMOLE_URL=http://localhost:8080/guacamole
GUACAMOLE_USERNAME=guacadmin
GUACAMOLE_PASSWORD=guacadmin

# Firebase
FIREBASE_CREDENTIALS_PATH=./firebase-service-account.json
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_DATABASE_URL=https://your-project-default-rtdb.firebaseio.com

# Uptime Kuma webhook secret (set this to anything, same value goes in Uptime Kuma)
UPTIME_KUMA_URL=http://localhost:3001
UPTIME_KUMA_WEBHOOK_SECRET=your-secret-here

# Dev only — skip Firebase token verification (never use in production)
DEV_AUTH_BYPASS=false
DEV_AUTH_ROLE=user
```

Place your Firebase service account JSON file at:
```
backend/firebase-service-account.json
```
Download it from Firebase Console → Project Settings → Service Accounts → Generate new private key.

---

### 3. Create the PostgreSQL database

Open pgAdmin or psql and run:

```sql
CREATE DATABASE workforceallocationdb;
```

The user and password must match what you put in `DATABASE_URL`.
If you use a different user:

```sql
CREATE USER gs_user WITH PASSWORD 'gs_pass';
GRANT ALL PRIVILEGES ON DATABASE workforceallocationdb TO gs_user;
```

---

### 4. Run Alembic migrations

This creates all the tables in your database. Run this from inside `backend/` with venv active.

```powershell
cd C:\PROJECTS\Workforce-Allocation-Platform\backend
venv\Scripts\activate
.\venv\Scripts\alembic upgrade head
```

Every time a model file changes, a new migration file is added to `migrations/versions/`.
Run `alembic upgrade head` again to apply it.

Useful migration commands:
```powershell
.\venv\Scripts\alembic current        # show which migration you're on
.\venv\Scripts\alembic downgrade -1   # roll back one migration
.\venv\Scripts\alembic history        # list all migrations
```

---

### 5. Generate the Guacamole database file (one time only)

Guacamole needs a database to store connections. This command creates the init file.

```powershell
cd C:\PROJECTS\Workforce-Allocation-Platform\infrastructure
docker run --rm guacamole/guacamole /opt/guacamole/bin/initdb.sh --postgresql | Out-File -Encoding utf8 guacamole_initdb.sql
```

Docker downloads the Guacamole image if not already present — takes 2–5 minutes.
When the prompt returns, confirm the file was created:

```powershell
ls guacamole_initdb.sql
```

---

### 6. Start all Docker containers

```powershell
cd C:\PROJECTS\Workforce-Allocation-Platform\infrastructure
docker compose up -d
```

Wait 30 seconds then check:

```powershell
docker compose ps
```

You should see 5 containers all showing `Up` or `running`:

```
infrastructure-redis-1          Up
infrastructure-guacd-1          Up
infrastructure-guac_db-1        Up
infrastructure-guacamole-1      Up
infrastructure-uptime-kuma-1    Up
```

Uptime Kuma UI: **http://localhost:3001**

If any show `Exit` — `guacamole_initdb.sql` is missing or corrupted.
Run `docker compose down -v` and repeat steps 5 and 6.

---

### 7. Register your RDP machine in Guacamole

This is where you enter the details of the actual Windows machine workers will connect to.
Do this once per machine.

1. Open `http://localhost:8080/guacamole` in your browser
2. Login: `guacadmin` / `guacadmin`
3. Top-right corner → click `guacadmin` → **Settings** → **Connections** tab → **New Connection**
4. Fill in:

   **Name** — a label for the machine, e.g. `Machine-KE-01`

   **Protocol** — select `RDP`

   Scroll down to **Parameters**:

   **Hostname** — IP address of the Windows machine workers will connect to

   **Port** — `3389`

   **Username** — Windows login username of the remote machine

   **Password** — Windows login password of the remote machine

   **Domain** — leave blank unless on Active Directory

   **Security mode** — `Any`

   **Ignore server certificate** — tick this checkbox

5. Click **Save**
6. Click the connection name in the list. Look at the URL:
   ```
   http://localhost:8080/guacamole/#/manage/connections/7
   ```
   The number at the end (`7`) is the **Connection ID**. Write it down.

---

### 8. Link the connection ID to the platform database

Open pgAdmin → `workforceallocationdb` → Query Tool.

First check what machines exist:
```sql
SELECT id, nickname, status, guacamole_connection_id FROM rdp_resources;
```

Then link the connection:
```sql
UPDATE rdp_resources
SET guacamole_connection_id = '7'
WHERE nickname = 'Machine-KE-01';
```
Replace `7` with your connection ID and `Machine-KE-01` with the machine nickname.

Set it to available so workers can claim it:
```sql
UPDATE rdp_resources
SET status = 'online_free'
WHERE nickname = 'Machine-KE-01';
```

---

### 9. Set up Uptime Kuma (RDP health monitoring)

Uptime Kuma checks whether each **physical RDP Windows machine** is reachable on **TCP port 3389**.
When a machine goes up or down, it sends one webhook to your backend, which updates PostgreSQL
(`rdp_resources.status`, `last_health_check_at`) and mirrors the change to Firebase.

This is **separate** from worker session heartbeats (`POST /sessions/{id}/heartbeat`), which detect
when a worker stops responding while already connected.

#### Do I need to set up all 100 RDPs?

| What | How many? | Notes |
|------|-----------|--------|
| Uptime Kuma **admin account** | **1** | You already created this at http://localhost:3001 |
| **Webhook notification** | **1** | One webhook receives events for **all** monitors |
| **TCP monitor** per RDP machine | **1 per machine** | 100 RDPs in Postgres → 100 monitors in Uptime Kuma |

So: you do **not** need 100 webhooks or 100 Uptime Kuma accounts. You **do** need **one TCP monitor per RDP machine** — but you only create the webhook once, then attach every monitor to that same notification.

For large fleets (50–100+ machines), use **bulk import** (see step 9.6) instead of clicking through each monitor by hand.

#### How the platform matches a monitor to a machine

The backend looks up the RDP row by **monitor name**:

1. **Friendly Name** in Uptime Kuma must equal `rdp_resources.nickname` in PostgreSQL (exact match, case-sensitive).
2. **Hostname** in Uptime Kuma should be the machine IP or DNS name (`rdp_resources.monitor_host`).
3. **Port** is usually `3389` (`rdp_resources.monitor_port`).

If the name does not match any `nickname`, the webhook is accepted but logged as `unknown monitor` — status in the platform will not change.

---

#### 9.1 — Confirm Uptime Kuma is running

```powershell
cd C:\PROJECTS\Workforce-Allocation-Platform\infrastructure
docker compose ps
```

`infrastructure-uptime-kuma-1` should show **Up**.

Open **http://localhost:3001** and log in with the account you created on first visit.

---

#### 9.2 — Set the webhook secret in the backend

In `backend/.env` (same value will go into Uptime Kuma in the next step):

```env
UPTIME_KUMA_URL=http://localhost:3001
UPTIME_KUMA_WEBHOOK_SECRET=choose-a-long-random-string-here
```

Restart the backend after changing `.env`.

Generate a random secret (PowerShell):

```powershell
[guid]::NewGuid().ToString() + [guid]::NewGuid().ToString()
```

---

#### 9.3 — Create ONE webhook notification (all monitors use this)

In Uptime Kuma:

1. **Settings** (gear, top right) → **Notifications** → **Setup Notification**
2. **Notification Type:** `Webhook`
3. **Friendly Name:** e.g. `GlobalSolutions Backend`
4. **URL** (backend must be running on port 8000):

   **Windows + Docker Desktop (recommended):**
   ```
   http://host.docker.internal:8000/integrations/uptime-kuma/webhook?token=YOUR_SECRET
   ```

   Replace `YOUR_SECRET` with the exact `UPTIME_KUMA_WEBHOOK_SECRET` from `.env`.

   If `host.docker.internal` does not work, use your PC's LAN IP instead:
   ```
   http://192.168.x.x:8000/integrations/uptime-kuma/webhook?token=YOUR_SECRET
   ```

5. **Request Method:** `POST`
6. **Request Body:** leave default (JSON) — Uptime Kuma sends monitor name and status automatically
7. **Apply on:** tick **Down** and **Up** (and **Maintenance** if you use maintenance monitors)
8. Click **Test** — you should see a success response if the backend is running
9. **Save**

You only do this **once**. Every RDP monitor you add later will select this same notification.

---

#### 9.4 — Ensure RDP rows exist in PostgreSQL with monitor fields

Each machine should be in `rdp_resources` before you add monitors. Example:

```sql
SELECT id, nickname, status, monitor_host, monitor_port, guacamole_connection_id
FROM rdp_resources
ORDER BY nickname;
```

When adding machines, set monitor target fields:

```sql
INSERT INTO rdp_resources (nickname, country, client_group, status, monitor_host, monitor_port)
VALUES ('RDP-KE-001', 'Kenya', 'ClientA', 'online_free', '192.168.1.50', 3389);
```

Or update existing rows:

```sql
UPDATE rdp_resources
SET monitor_host = '192.168.1.50', monitor_port = 3389
WHERE nickname = 'RDP-KE-001';
```

**Rule:** `nickname` = Uptime Kuma Friendly Name. `monitor_host` = IP/hostname Uptime Kuma will TCP-check.

---

#### 9.5 — Add one TCP monitor (test with a single machine first)

Do this for **one** machine before bulk-importing the rest.

1. Uptime Kuma dashboard → **Add New Monitor**
2. **Monitor Type:** `TCP Port`
3. **Friendly Name:** must match Postgres exactly, e.g. `RDP-KE-001`
4. **Hostname:** the Windows machine IP, e.g. `192.168.1.50`
5. **Port:** `3389`
6. **Heartbeat Interval:** `60` seconds (matches platform charter; 30s also fine)
7. **Retries:** `2` (optional — reduces false alarms)
8. **Notifications:** select `GlobalSolutions Backend` (the webhook from 9.3)
9. **Save**

Within about a minute the monitor should show **Up** (green) if port 3389 is open on that PC.

**Test down event:** temporarily block port 3389 on the Windows firewall or shut down the VM. Within 1–2 minutes Uptime Kuma should flip to **Down** and the platform should set that RDP to `offline` in PostgreSQL:

```sql
SELECT nickname, status, last_health_check_at FROM rdp_resources WHERE nickname = 'RDP-KE-001';
```

Bring the machine back up — status should recover to `online_free` (or `assigned` if a worker was pre-assigned).

---

#### 9.6 — Bulk setup for many machines (e.g. 100 RDPs)

You still need **one monitor per machine**, but you do not need to click through the UI 100 times.

**Option A — Uptime Kuma import/export (recommended)**

1. Create **one** TCP monitor manually (step 9.5) and configure it correctly.
2. Uptime Kuma → **Settings** → **Backup** → **Export** (downloads a JSON backup).
3. Open the JSON and duplicate the monitor block for each machine, changing:
   - `name` (Friendly Name) → each `rdp_resources.nickname`
   - `hostname` → each `monitor_host`
   - `port` → `3389` or each `monitor_port`
4. **Settings** → **Backup** → **Import** → upload the edited file.

**Option B — Generate monitor list from PostgreSQL**

Export nicknames and hosts from the database:

```sql
SELECT nickname, monitor_host, COALESCE(monitor_port, 3389) AS monitor_port
FROM rdp_resources
WHERE monitor_host IS NOT NULL
ORDER BY nickname;
```

Use that CSV/JSON to script monitor JSON entries (spreadsheet + find/replace, or a small Python script). Then import via Uptime Kuma backup import.

**Option C — Uptime Kuma Monitor Group**

After import, create a **Monitor Group** (e.g. `RDP Fleet`) and assign all TCP monitors to it so the dashboard stays organised. Groups do not change how webhooks work.

**What you do NOT duplicate per machine:**

- Webhook notification (one for the whole fleet)
- Backend `.env` secret (one value)
- Uptime Kuma login account (one admin)

---

#### 9.7 — Verify the integration from the API

With the backend running and logged in as admin, open:

```
http://localhost:8000/docs
```

Find `GET /integrations/uptime-kuma/status` (requires admin Firebase token), or from the frontend admin session use the API proxy.

Expected response shape:

```json
{
  "webhook_path": "/integrations/uptime-kuma/webhook",
  "webhook_secret_configured": true,
  "uptime_kuma_ui": "http://localhost:3001",
  "monitor_naming": "Use rdp_resources.nickname as the Uptime Kuma monitor name",
  "monitor_type": "TCP Port 3389 (RDP)",
  "check_interval_seconds": 60
}
```

Manual webhook test (PowerShell, replace secret):

```powershell
Invoke-RestMethod -Method POST `
  -Uri "http://localhost:8000/integrations/uptime-kuma/webhook?token=YOUR_SECRET" `
  -ContentType "application/json" `
  -Body '{"heartbeat":{"status":1},"monitor":{"name":"RDP-KE-001"}}'
```

You should get `"ok": true` and a matching `rdp_id` if `RDP-KE-001` exists in Postgres.

---

#### 9.8 — What status changes Uptime Kuma causes

| Uptime Kuma event | Platform `rdp_resources.status` |
|-------------------|----------------------------------|
| TCP **Up** after down | `offline` / `unhealthy` → `online_free` or `assigned` |
| TCP **Down** | `offline` |
| **Maintenance** monitor | `maintenance` |
| Machine is `admin_locked` | Health events **ignored** (lock is not cleared automatically) |

Firebase `rdp_status` and the worker claim board update when PostgreSQL changes (mirror + optional Firestore `onSnapshot` on the frontend).

---

#### 9.9 — Uptime Kuma checklist (quick reference)

```
[ ] Docker: uptime-kuma container Up (port 3001)
[ ] Uptime Kuma admin account created (first visit only)
[ ] backend/.env: UPTIME_KUMA_WEBHOOK_SECRET and UPTIME_KUMA_URL set
[ ] Backend restarted after .env change
[ ] ONE webhook notification → host.docker.internal:8000/integrations/uptime-kuma/webhook?token=...
[ ] Webhook Test button succeeds
[ ] Every rdp_resources row has nickname + monitor_host (+ monitor_port)
[ ] ONE TCP monitor per RDP; Friendly Name = nickname; port 3389
[ ] Each monitor uses the shared webhook notification
[ ] Test: one machine down → status offline in Postgres; up → recovers
```

More detail also lives in `infrastructure/uptime-kuma/README.md`.

---

## EVERY SESSION — Run this each time you develop

```
1. Open Docker Desktop — wait for "Engine running" (whale icon in system tray)
2. PowerShell:  cd infrastructure && docker compose up -d
3. New PowerShell:  cd backend && venv\Scripts\activate && uvicorn main:app --reload --port 8000
4. New PowerShell:  cd frontend && npm run dev
```

Backend runs at `http://localhost:8000` — API docs at `http://localhost:8000/docs`

Frontend runs at `http://localhost:3000`

### Background jobs that start with the backend

| Job | File | What it does |
|-----|------|--------------|
| Leaderboard sync | `services/leaderboard_sync.py` | Every 5 min, refreshes leaderboard in Firestore from `quality_composite_scores` |
| Mirror reconcile | `services/mirror_reconcile.py` | Re-asserts `rdp_status` and `active_sessions` from PostgreSQL so Firestore self-heals after failures |
| RDP lifecycle | `services/rdp_lifecycle.py` | Every 60s, marks machines `idle` without session heartbeat (10m) and auto-releases after 20m idle |

Uptime Kuma runs separately in Docker (port **3001**) and pushes TCP up/down events to the backend webhook — it does not start inside uvicorn.

---

## Shutdown

```powershell
cd C:\PROJECTS\Workforce-Allocation-Platform\infrastructure
docker compose down
```

Full reset — wipes Guacamole database (you will need to re-register connections):
```powershell
docker compose down -v
```

---

## Production (Nginx + Gunicorn)

In development you don't need this. In production, Nginx sits in front of the backend for HTTPS.

### Nginx config

Create `/etc/nginx/sites-available/globalsolutions-api`:

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name api.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;

    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;

    location / {
        proxy_pass         http://127.0.0.1:8000;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/globalsolutions-api /etc/nginx/sites-enabled/
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d api.yourdomain.com
sudo nginx -t && sudo systemctl reload nginx
```

### Run with Gunicorn in production

```bash
pip install gunicorn
gunicorn main:app --workers 4 --worker-class uvicorn.workers.UvicornWorker --bind 127.0.0.1:8000
```

Or as a systemd service — create `/etc/systemd/system/globalsolutions-api.service`:

```ini
[Unit]
Description=GlobalSolutions API
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/Workforce-Allocation-Platform/backend
Environment="PATH=/home/ubuntu/Workforce-Allocation-Platform/backend/venv/bin"
ExecStart=/home/ubuntu/Workforce-Allocation-Platform/backend/venv/bin/gunicorn main:app --workers 4 --worker-class uvicorn.workers.UvicornWorker --bind 127.0.0.1:8000
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable globalsolutions-api
sudo systemctl start globalsolutions-api
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Containers show `Exit` after `docker compose up` | `guacamole_initdb.sql` is missing — run step 5 again |
| `http://localhost:8080/guacamole` shows nothing | Docker Desktop not running — open it and wait 60 seconds |
| Backend crash: Redis connection refused | Run `docker compose up -d` first |
| Backend crash: PostgreSQL connection refused | PostgreSQL not running — start it from Windows Services or pgAdmin |
| Claim button works but no new tab opens | `guacamole_connection_id` is null — run the SQL UPDATE in step 8 |
| Guacamole tab opens but screen is black | Windows Firewall on the remote PC is blocking port 3389 |
| `venv\Scripts\activate` not found | Run `python -m venv venv` then `pip install -r requirements.txt` |
| Guacamole login fails with guacadmin/guacadmin | Run `docker compose down -v`, regenerate `guacamole_initdb.sql`, then `docker compose up -d` |
| `ModuleNotFoundError` | Virtual environment not activated — run `venv\Scripts\activate` |
| `Target database is not up to date` | Run `.\venv\Scripts\alembic upgrade head` |
| `firebase-service-account.json` not found | Download from Firebase Console and place at `backend/firebase-service-account.json` |
| Uptime Kuma webhook Test fails | Backend not running on port 8000, or wrong `UPTIME_KUMA_WEBHOOK_SECRET` in URL vs `.env` |
| Uptime Kuma shows Up but platform status unchanged | Monitor **Friendly Name** does not exactly match `rdp_resources.nickname` |
| Webhook returns `unknown monitor` | Add/fix the RDP row in Postgres, or rename the Uptime Kuma monitor to match `nickname` |
| `host.docker.internal` webhook unreachable | Use your PC LAN IP in the webhook URL instead, e.g. `http://192.168.1.10:8000/...` |
| 100 RDPs — too many to click | Create one monitor, export Uptime Kuma backup JSON, duplicate entries, re-import (see step 9.6) |
