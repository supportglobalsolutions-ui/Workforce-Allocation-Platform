# Backend Setup Guide
## GlobalSolutions Workforce Allocation Platform

This covers everything you need to run the backend from scratch —
Python, PostgreSQL, Redis, Guacamole (Docker), Alembic migrations,
and the reverse proxy for production.

---

## What you need installed first

| Tool | Why | Download |
|------|-----|----------|
| Python 3.12+ | Runs the backend | python.org |
| PostgreSQL 15+ | Main database | postgresql.org |
| Docker Desktop | Runs Redis + Guacamole | docker.com/products/docker-desktop |
| Git | Version control | git-scm.com |

> Install all four before continuing. Restart your PC after Docker Desktop installs.

---

## 1. Clone and navigate to the backend

```bash
cd C:\PROJECTS\Workforce-Allocation-Platform\backend
```

---

## 2. Create a virtual environment

```bash
python -m venv venv
venv\Scripts\activate
```

Your terminal prompt should now show `(venv)` at the start.
You must activate this every time you open a new terminal before running the backend.

---

## 3. Install Python dependencies

```bash
pip install -r requirements.txt
```

This installs everything: FastAPI, SQLModel, Pydantic, Firebase Admin SDK,
Redis client, httpx, passlib, and all their dependencies.

If a package fails to build, it means your Python version is too new for
that package's pre-built wheel. The requirements.txt uses `>=` pins so pip
finds compatible versions automatically — just make sure you are on Python 3.12+.

---

## 4. Set up your .env file

Copy the example and fill in your values:

```bash
copy .env.example .env
```

Open `.env` and set these values:

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
```

Place your Firebase service account JSON file at:
```
backend/firebase-service-account.json
```
Download it from Firebase Console → Project Settings → Service Accounts → Generate new private key.

---

## 5. Create the PostgreSQL database

Open pgAdmin or psql and run:

```sql
CREATE DATABASE workforceallocationdb;
```

The user and password must match what you put in DATABASE_URL above.
If you use a different user:

```sql
CREATE USER gs_user WITH PASSWORD 'gs_pass';
GRANT ALL PRIVILEGES ON DATABASE workforceallocationdb TO gs_user;
```

---

## 6. Run Alembic migrations

This creates all the tables in your database.

```bash
# Still inside backend/ with venv active

# First time — initialize the migrations folder if it doesn't exist
alembic init migrations

# Generate a migration from your models (run this whenever models change)
alembic revision --autogenerate -m "initial schema"

# Apply migrations to the database
alembic upgrade head
```

Every time you change a model file, run:
```bash
alembic revision --autogenerate -m "describe your change"
alembic upgrade head
```

To check what migration you're on:
```bash
alembic current
```

To roll back one migration:
```bash
alembic downgrade -1
```

---

## 7. Start Redis and Guacamole with Docker

Redis handles RDP claim locking (prevents two workers claiming the same machine).
Guacamole provides browser-based RDP (workers connect to Windows machines in their browser).

### 7a. Generate the Guacamole database init file (one time only)

```bash
cd C:\PROJECTS\Workforce-Allocation-Platform\infrastructure

docker run --rm guacamole/guacamole /opt/guacamole/bin/initdb.sh --postgresql > guacamole_initdb.sql
```

This creates `guacamole_initdb.sql`. Only needs to run once ever.

### 7b. Start all containers

```bash
cd C:\PROJECTS\Workforce-Allocation-Platform\infrastructure

docker compose up -d
```

Check everything is running:
```bash
docker compose ps
```

You should see three containers: `guacd`, `guac_db`, `guacamole`.

To stop them:
```bash
docker compose down
```

To stop and delete all data (full reset):
```bash
docker compose down -v
```

### 7c. Configure Guacamole admin panel

1. Open `http://localhost:8080/guacamole` in your browser
2. Login: `guacadmin` / `guacadmin`
3. Top right → your username → **Settings** → **Connections** → **New Connection**
4. Fill in:
   - Name: anything descriptive (e.g. `Machine-KE-01`)
   - Protocol: `RDP`
   - Hostname: the Windows machine's IP address
   - Port: `3389`
   - Username: the Windows login username
   - Password: the Windows login password
5. Click **Save**
6. Click the connection you just created and look at the URL:
   ```
   http://localhost:8080/guacamole/#/manage/connections/1
   ```
   The number at the end is the **connection ID**. Save it.

### 7d. Link the machine in your database

```sql
UPDATE rdp_resources
SET guacamole_connection_id = '1'
WHERE nickname = 'Machine-KE-01';
```

Replace `'1'` with the connection ID from the Guacamole URL.
Replace `'Machine-KE-01'` with whatever nickname you gave the machine in your platform.

When a worker clicks **Claim** on that machine, they get taken directly to the
Windows desktop in their browser — no credentials needed on their side.

---

## 8. Run the backend server

```bash
cd C:\PROJECTS\Workforce-Allocation-Platform\backend
venv\Scripts\activate

uvicorn main:app --reload --port 8000
```

The API is now running at `http://localhost:8000`.

API docs (development only): `http://localhost:8000/docs`

Health check: `http://localhost:8000/health`

---

## 9. Full startup checklist (every time you develop)

Run these in order each time you start a new dev session:

```
1. Start Docker Desktop — wait for "Engine running"
2. cd infrastructure && docker compose up -d
3. cd ../backend && venv\Scripts\activate
4. uvicorn main:app --reload --port 8000
5. cd ../frontend && npm run dev    (separate terminal)
```

---

## 10. Reverse proxy (Nginx) — for production only

In development you don't need this. In production, Nginx sits in front of
your backend and handles HTTPS, domain routing, and security headers.

### Install Nginx (on your production server)

```bash
# Ubuntu/Debian
sudo apt update && sudo apt install nginx

# Verify
nginx -v
```

### Nginx config for the backend

Create `/etc/nginx/sites-available/globalsolutions-api`:

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    # Redirect all HTTP to HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name api.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";

    location / {
        proxy_pass         http://127.0.0.1:8000;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}
```

### Enable the site and get an SSL certificate

```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/globalsolutions-api /etc/nginx/sites-enabled/

# Get free SSL certificate (Let's Encrypt)
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d api.yourdomain.com

# Reload Nginx
sudo nginx -t && sudo systemctl reload nginx
```

### Run the backend with Gunicorn in production

In production, replace `uvicorn main:app --reload` with Gunicorn + Uvicorn workers:

```bash
pip install gunicorn

gunicorn main:app \
  --workers 4 \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 127.0.0.1:8000 \
  --access-logfile - \
  --error-logfile -
```

Or create a systemd service so it starts automatically on server reboot:

Create `/etc/systemd/system/globalsolutions-api.service`:

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
sudo systemctl status globalsolutions-api
```

---

## Troubleshooting

**`ModuleNotFoundError`** — Virtual environment not activated. Run `venv\Scripts\activate`.

**`connection refused` on database** — PostgreSQL not running. Start it from Services or pgAdmin.

**`connection refused` on Redis** — Docker not running or containers not started. Run `docker compose up -d`.

**Alembic `Target database is not up to date`** — Run `alembic upgrade head`.

**Guacamole shows blank screen** — The Windows machine's firewall is blocking port 3389. Allow RDP through Windows Firewall on the remote machine.

**`firebase-service-account.json` not found** — Download from Firebase Console and place it at `backend/firebase-service-account.json`.
