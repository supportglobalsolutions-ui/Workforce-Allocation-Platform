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
| Mirror reconcile | `services/firebase_mirror.py` | Re-asserts `rdp_status` and `active_sessions` from PostgreSQL so Firestore self-heals after failures |

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
