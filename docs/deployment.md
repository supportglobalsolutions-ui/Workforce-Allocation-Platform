# Production Deployment Guide: Hetzner Backend & Vercel Frontend
### GlobalSolutions Workforce Allocation Platform

> **Topology:** production runs on **one Hetzner VPS** (API + Redis + Guacamole + coordinator + Kuma). A separate media host is **not** planned. **No numeric max-session cap** (`RDP_MAX_LIVE_SESSIONS=0`). See [rdp-architecture.md](rdp-architecture.md) §3 (single-VPS; cancelled second-host work).
>
> **Multi-host redundancy** templates remain in [rdp-architecture.md](rdp-architecture.md) §4 / `scripts/rdp_acceptance.py` for optional future use; live ops stay single-host.

This is the single, complete, step-by-step production deployment manual for the platform. It walks you through deploying the **Backend & Infrastructure** (FastAPI, Redis, Apache Guacamole, Uptime Kuma) on a **Hetzner Cloud VPS**, connecting to **Supabase** for PostgreSQL and Authentication, and hosting the **Frontend** (Next.js 14) on **Vercel**.

---

## Table of Contents
1. [Architecture Overview](#1-architecture-overview)
2. [Complete System Requirements & Sizing](#2-complete-system-requirements--sizing)
3. [Port & Network Matrix](#3-port--network-matrix)
4. [Step 1: Provision & Secure Your Hetzner Server](#step-1-provision--secure-your-hetzner-server)
5. [Step 2: Install Server Software (Python, Docker, Nginx)](#step-2-install-server-software-python-docker-nginx)
6. [Step 3: Connect Supabase PostgreSQL & Run Alembic Migrations](#step-3-connect-supabase-postgresql--run-alembic-migrations)
7. [Step 4: Launch Docker Services (Redis, Guacamole, Uptime Kuma)](#step-4-launch-docker-services-redis-guacamole-uptime-kuma)
8. [Step 5: Configure & Deploy the FastAPI Backend](#step-5-configure--deploy-the-fastapi-backend)
9. [Step 6: Configure Systemd (24/7 Process Manager)](#step-6-configure-systemd-247-process-manager)
10. [Step 7: Configure Nginx Reverse Proxy & Free SSL](#step-7-configure-nginx-reverse-proxy--free-ssl)
11. [Step 8: Deploy Next.js Frontend to Vercel](#step-8-deploy-nextjs-frontend-to-vercel)
12. [Step 9: Link Frontend & Backend Together](#step-9-link-frontend--backend-together)
13. [Step 10: End-to-End Verification Checklist](#step-10-end-to-end-verification-checklist)
14. [Routine Maintenance & Updating Code](#routine-maintenance--updating-code)
15. [Troubleshooting Common Issues](#troubleshooting-common-issues)

---

## 1. Architecture Overview

```
                               ┌─────────────────────────────────┐
                               │           USER BROWSER          │
                               └────────┬───────────────┬────────┘
                                        │               │
                     1. Web App Traffic │               │ 3. WebSocket Canvas /
                    (HTML, JS, CSS, UI) │               │    Direct API Calls
                                        ▼               ▼
                        ┌───────────────────┐ ┌───────────────────────────────────┐
                        │    VERCEL EDGE    │ │         HETZNER CLOUD VPS         │
                        │ (Next.js Frontend)│ │                                   │
                        │ app.yourdomain.com│ │   api.yourdomain.com (Nginx 443)  │
                        └─────────┬─────────┘ └─────────────────┬─────────────────┘
                                  │                             │
                                  │ 2. Next.js /api Rewrites    │ Nginx Reverse Proxy
                                  └─────────────────────────────┼─────────────────┐
                                                                │                 │
                                                                ▼                 ▼
                                                     ┌────────────────────┐ ┌───────────────┐
                                                     │ FastAPI (Port 8000)│ │ Guacamole Web │
                                                     │ Gunicorn + Uvicorn │ │ (Port 8080)   │
                                                     └────┬───────┬───────┘ └───────┬───────┘
                                                          │       │                 │
                                    ┌─────────────────────┘       └─────────┐       │
                                    ▼                                       ▼       ▼
                          ┌──────────────────┐                            ┌────────────┐
                          │     SUPABASE     │                            │ guacd RDP  │
                          │   (PostgreSQL)   │                            │  (Daemon)  │
                          │  Port 5432/6543  │                            └─────┬──────┘
                          └──────────────────┘                                  │
                                                                                │ 3389 (TCP)
                          ┌──────────────────┐     ┌──────────────┐             ▼
                          │   Redis Cache    │     │ Uptime Kuma  │      ┌─────────────┐
                          │   (Port 6379)    │     │ (Port 3001)  │─3389▶│ Windows RDP │
                          └──────────────────┘     └──────────────┘      │   Machines  │
                                                                         └─────────────┘
```

- **Frontend (Vercel)**: Next.js 14 App Router served at the global edge. Provides fast UI loading, handles authentication sessions via signed cookies, and proxies `/api/*` to the Hetzner API. It does **not** proxy `/remote/*` to Guacamole in production (Phase 1 Safety — that rewrite could expose Guacamole REST and Windows passwords).
- **Backend (Hetzner VPS)**: Runs FastAPI with Gunicorn/Uvicorn, handles long-running background tasks (RDP lifecycle timeouts, bulk email dispatch loops, Uptime Kuma webhooks).
- **Database & Auth (Supabase)**: Managed PostgreSQL with connection pooling and GoTrue JWT authentication.
- **Microservices (Docker on Hetzner)**:
  - **Redis 7**: Distributed RDP claim locks (`lock:rdp:{id}`), session heartbeats, and rate limiting.
  - **Apache Guacamole (`guacd` + `web` + `guac_db`)**: Browser-based HTML5 Remote Desktop gateway.
  - **Uptime Kuma**: Probes physical Windows RDP machines on TCP port 3389 and pushes status webhooks to FastAPI.

---

## 2. Complete System Requirements & Sizing

### 2.1 Hetzner Server Hardware Sizing
Guacamole transcodes Windows desktop graphical frames into HTML5 canvas WebSockets. Sizing depends primarily on how many workers use RDP simultaneously:

| Concurrent Active RDP Workers | Recommended Hetzner Plan | Specs (AMD EPYC) | Monthly Cost (Approx) |
| :--- | :--- | :--- | :--- |
| **1 – 15 workers** | **CPX21** | 3 vCPU, 4 GB RAM, 80 GB NVMe | ~€8.50 / mo |
| **15 – 45 workers** | **CPX31** *(Recommended)* | 4 vCPU, 8 GB RAM, 160 GB NVMe | ~€15.50 / mo |
| **45 – 100+ workers** | **CPX41** or **CCX13** | 8 vCPU, 16–32 GB RAM, Dedicated | ~€30–€60 / mo |

> **Recommendation**: Start on **CPX31** (8 GB RAM). It provides comfortable headroom for 4 Gunicorn workers, the Redis container, the Guacamole daemon, and Uptime Kuma without risk of out-of-memory (OOM) crashes.

### 2.2 Memory Breakdown on the Server
- **Ubuntu OS + Nginx**: ~400 MB
- **FastAPI / Gunicorn (4 Uvicorn workers)**: ~350 MB – 500 MB
- **Redis 7 (Alpine)**: ~50 MB
- **Guacamole Web (`guacamole/guacamole`)**: ~350 MB (Java Tomcat)
- **Guacamole Dedicated DB (`postgres:15-alpine`)**: ~100 MB
- **Uptime Kuma (`louislam/uptime-kuma`)**: ~150 MB (Node.js engine)
- **Guacamole Daemon (`guacd`)**: ~30 MB baseline + **30 MB to 50 MB per active streaming session**.
- **Minimum Base Memory**: ~2.5 GB before user sessions start.

### 2.3 Software Versions Required
- **Server Operating System**: Ubuntu 24.04 LTS or 22.04 LTS (x86_64).
- **Python**: `3.12+` (with `python3-venv` and `libpq-dev`).
- **Docker Engine**: Version `24.0+` with the `docker-compose-plugin` (Compose v2).
- **Web Server**: `Nginx` (with HTTP/1.1 and WebSocket upgrade mapping).
- **SSL**: `Certbot` + `python3-certbot-nginx` (Let's Encrypt).
- **Database**: Supabase PostgreSQL with pooler enabled (IPv4 pooler on port `5432` and `6543`).
- **Frontend Platform**: Node.js 18.x or 20.x on Vercel.

---

## 3. Port & Network Matrix

You must ensure network traffic is routed correctly:

### Public Ports (Allowed in UFW Firewall & Hetzner Cloud Firewall)
| Port | Protocol | Purpose | Destination |
| :--- | :--- | :--- | :--- |
| **22** | TCP | SSH Server Administration | Hetzner VPS |
| **80** | TCP | HTTP (Let's Encrypt verification & redirect to 443) | Nginx |
| **443** | TCP | HTTPS (Web traffic, API requests, Guacamole WebSockets) | Nginx |

### Internal-Only Ports (Must NEVER be opened to the public internet)
| Port | Service | Bound To | Notes |
| :--- | :--- | :--- | :--- |
| **8000** | FastAPI Application | `127.0.0.1:8000` | Nginx proxies to this |
| **8080** | Guacamole Web Container | `127.0.0.1:8080` | Nginx proxies to this |
| **6379** | Redis Container | `127.0.0.1:6379` | Used by FastAPI backend |
| **3001** | Uptime Kuma Container | `127.0.0.1:3001` | Probed internally or via Nginx |
| **4822** | `guacd` Protocol Daemon | Internal Docker Network | Only Guacamole web talks to this |

### Outbound Ports (Server must be able to connect outward to)
| Port | Target Host | Purpose |
| :--- | :--- | :--- |
| **5432** | `aws-0-<region>.pooler.supabase.com` | Supabase **Session Pooler** (used for Alembic migrations) |
| **6543** | `aws-0-<region>.pooler.supabase.com` | Supabase **Transaction Pooler** (used by running FastAPI app) |
| **443** | `https://<ref>.supabase.co` | Supabase GoTrue Auth API & JWKS verification |
| **3389** | Remote Windows RDP Machine IPs | Guacamole RDP connection & Uptime Kuma TCP health check |
| **443** | `api.resend.com` | Outbound transactional emails (payslips, notifications) |

---

## Step 1: Provision & Secure Your Hetzner Server

### 1.1 Create the Server in Hetzner Cloud
1. Go to [Hetzner Cloud Console](https://console.hetzner.cloud/).
2. Create or select a project (e.g. `workforce-platform`).
3. Click **Add Server**:
   - **Location**: Falkenstein (EU) or Nuremberg (EU) or Ashburn (US) — pick the region closest to your RDP machines and staff.
   - **OS Image**: **Ubuntu 24.04 LTS**.
   - **Type**: **Standard** -> **CPX31** (4 vCPU, 8 GB RAM) or **CPX21** (3 vCPU, 4 GB RAM).
   - **Networking**: Ensure **Public IPv4 + Public IPv6** are enabled.
   - **SSH Keys**: Add your local computer's public SSH key (`~/.ssh/id_ed25519.pub` or `~/.ssh/id_rsa.pub`).
   - **Server Name**: `workforce-backend-prod`.
4. Click **Create & Buy now**. Note down the assigned public **IPv4 address** (e.g., `195.201.85.100`).

---

### 1.2 First Login & Update System
From your local terminal (PowerShell or Bash):

```bash
ssh root@<YOUR_SERVER_IP>
```

Update system packages:
```bash
apt update && apt upgrade -y
```

---

### 1.3 Create Non-Root Deployer User
Never run production applications as `root`:

```bash
# 1. Create deployer user
adduser --gecos "" deployer

# 2. Grant sudo privileges
usermod -aG sudo deployer

# 3. Copy SSH authorization from root
mkdir -p /home/deployer/.ssh
cp /root/.ssh/authorized_keys /home/deployer/.ssh/
chown -R deployer:deployer /home/deployer/.ssh
chmod 700 /home/deployer/.ssh
chmod 600 /home/deployer/.ssh/authorized_keys
```

Verify you can connect as `deployer` from your local machine:
```bash
ssh deployer@<YOUR_SERVER_IP>
```

---

### 1.4 Configure the Firewall (UFW)
```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```
Type `y` and press Enter when prompted. Check status:
```bash
sudo ufw status
```

---

## Step 2: Install Server Software (Python, Docker, Nginx)

Run these commands as user `deployer`:

### 2.1 Install Python 3.12 and System Build Tools
```bash
sudo apt install -y python3 python3-pip python3-venv git curl build-essential libpq-dev
```

### 2.2 Install Docker Engine & Docker Compose Plugin
```bash
# 1. Add Docker official GPG key
sudo apt install -y ca-certificates gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# 2. Add repository to Apt sources
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# 3. Install Docker packages
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 4. Add deployer to docker group so sudo is not needed for docker commands
sudo usermod -aG docker deployer
newgrp docker
```

Verify Docker works:
```bash
docker --version
docker compose version
```

### 2.3 Install Nginx and Certbot
```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

---

## Step 3: Connect Supabase PostgreSQL & Run Alembic Migrations

Your database is hosted on **Supabase**. Supabase provides three connection types in your dashboard under **Project Settings > Database > Connection pooling**:

1. **Direct Connection (`db.<ref>.supabase.co:5432`)**: IPv6 only on free tier.
2. **Session Pooler (`aws-0-<region>.pooler.supabase.com:5432`)**: IPv4 connection, 1 backend per client. **Required for Alembic migrations**.
3. **Transaction Pooler (`aws-0-<region>.pooler.supabase.com:6543`)**: IPv4 connection with pgbouncer. **Required for the running FastAPI application in production**.

### 3.1 Clone the Repository onto Hetzner
```bash
cd /home/deployer
git clone https://github.com/YOUR_GITHUB_USERNAME/YOUR_REPO_NAME.git app
cd /home/deployer/app
```

### 3.2 Create Python Virtual Environment & Install Requirements
```bash
cd /home/deployer/app/backend
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
pip install gunicorn
```

### 3.3 Run Alembic Migrations Against Supabase
In Supabase, find your connection pooling string.

Example Session Pooler connection string:
```
postgresql://postgres.<project-ref>:<db-password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require
```

Create a temporary or permanent `backend/.env` containing your `DATABASE_URL`:
```bash
nano /home/deployer/app/backend/.env
```

Set the database connection string:
```ini
DATABASE_URL=postgresql://postgres.<project-ref>:<your-password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require
DATABASE_USE_PGBOUNCER=false
```

Save (`Ctrl+O`, Enter, `Ctrl+X`) and run:
```bash
cd /home/deployer/app/backend
source venv/bin/activate
alembic upgrade head
```

You will see Alembic apply all migrations:
```
INFO  [alembic.runtime.migration] Context impl PostgresqlImpl.
INFO  [alembic.runtime.migration] Will assume transactional DDL.
INFO  [alembic.runtime.migration] Running upgrade  -> 24cc3a8f148d, initial_schema
...
INFO  [alembic.runtime.migration] Running upgrade ... -> <latest_revision>
```
All tables are now built in your Supabase database!

---

## Step 4: Launch Docker Services (Redis, Guacamole, Uptime Kuma)

The file `infrastructure/docker-compose.yml` runs Redis, Apache Guacamole, and Uptime Kuma.

### 4.1 Generate the Guacamole Database Init SQL
Guacamole needs an internal PostgreSQL schema for its user and connection storage. We generate it once:

```bash
cd /home/deployer/app/infrastructure

# Run official guacamole image to produce the init schema
docker run --rm guacamole/guacamole /opt/guacamole/bin/initdb.sh --postgresql > guacamole_initdb.sql

# Confirm the file was created (should be ~40KB+)
ls -lh guacamole_initdb.sql
```

### 4.2 Start the Containers
```bash
cd /home/deployer/app/infrastructure
docker compose up -d
```

Check that all 5 services are running:
```bash
docker compose ps
```
You should see:
```
NAME                           IMAGE                        STATUS
infrastructure-guac_db-1       postgres:15-alpine           Up
infrastructure-guacd-1         guacamole/guacd:latest       Up
infrastructure-guacamole-1     guacamole/guacamole:latest   Up
infrastructure-redis-1         redis:7-alpine               Up
infrastructure-uptime-kuma-1   louislam/uptime-kuma:1       Up
```

Test that Redis is responding:
```bash
docker exec -it infrastructure-redis-1 redis-cli ping
```
Output must be: `PONG`.

---

## Step 5: Configure & Deploy the FastAPI Backend

### 5.1 Prepare the Production `backend/.env`
Now switch `DATABASE_URL` to Supabase's **Transaction Pooler (port 6543)** and enable `DATABASE_USE_PGBOUNCER=true`. This ensures SQLAlchemy uses `NullPool` so your Supabase connection limit is never exhausted:

```bash
nano /home/deployer/app/backend/.env
```

Paste and complete the production configuration:

```ini
# ── Environment ───────────────────────────────────────────────
ENVIRONMENT=production
LOG_LEVEL=INFO

# Replace with your Vercel URL and custom domain
ALLOWED_ORIGINS=["https://app.yourdomain.com", "https://your-app.vercel.app"]

# Development bypass MUST be false in production
DEV_AUTH_BYPASS=false
DEV_AUTH_ROLE=user

# ── Supabase Database (Transaction Pooler on Port 6543) ───────
DATABASE_URL=postgresql://postgres.<project-ref>:<db-password>@aws-0-<region>.pooler.supabase.com:6543/postgres?sslmode=require
DATABASE_USE_PGBOUNCER=true

# ── Supabase Auth (GoTrue JWT Verification & Admin) ───────────
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SECRET_KEY=your_supabase_service_role_key_here
SUPABASE_JWKS_URL=https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json

# ── Redis (Runs locally in Docker container) ──────────────────
REDIS_URL=redis://localhost:6379/0

# ── RDP link safety (current 2 GB VPS) ────────────────────────
# A lost browser tunnel holds its machine for 5 minutes so a worker can reconnect.
RDP_DISCONNECT_GRACE_SECONDS=300
# Conservative cap for the current 2 GB all-in-one host. Increase only after
# moving/upgrading the media host and measuring representative live sessions.
RDP_MAX_LIVE_SESSIONS=6

# ── Cookie Security (MUST BE IDENTICAL TO VERCEL CONFIG) ──────
# Generate with: openssl rand -hex 32
SESSION_COOKIE_SECRET=paste_long_random_64_character_hex_string_here
OTP_PEPPER=paste_another_long_random_64_character_hex_string_here

# ── Apache Guacamole (Runs locally in Docker container) ───────
GUACAMOLE_URL=http://localhost:8080/guacamole
GUACAMOLE_USERNAME=guacadmin
GUACAMOLE_PASSWORD=guacadmin

# ── Direct Guacamole media plane (Phase 5) ────────────────────
# Public origin the browser opens the canvas against. With this set (plus a
# key below and MODE not "off"), pixels go browser -> Guacamole directly and
# an API restart no longer kills live desktops.
GUACAMOLE_PUBLIC_URL=https://guac.yourdomain.com

# Shared 128-bit key for guacamole-auth-json. MUST equal JSON_SECRET_KEY on
# the Guacamole container. Generate with:
#   python -c "import secrets; print(secrets.token_hex(16))"
GUACAMOLE_JSON_SECRET_KEY=paste_32_hex_characters_here

# Rollout: off | pilot | on. Start at "pilot" with a couple of real workers,
# watch them for a full shift, then move to "on".
RDP_DIRECT_GATEWAY_MODE=off
RDP_DIRECT_GATEWAY_PILOT_EMAILS=

# ── Uptime Kuma ───────────────────────────────────────────────
UPTIME_KUMA_URL=http://localhost:3001
UPTIME_KUMA_WEBHOOK_SECRET=paste_random_secret_token_here

# ── Outbound Email (Resend) ───────────────────────────────────
RESEND_API_KEY=re_your_resend_api_key_here
RESEND_FROM_EMAIL=GlobalSolutions <noreply@yourdomain.com>
APP_BASE_URL=https://app.yourdomain.com
EMAIL_DISPATCH_ENABLED=true

# ── AI Insights (Gemini) ──────────────────────────────────────
GOOGLE_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3.6-flash
```

Save and exit (`Ctrl+O`, Enter, `Ctrl+X`).

---

## Step 6: Configure Systemd (24/7 Process Manager)

Systemd automatically launches your backend on boot and restarts it if it crashes.

### 6.1 Create the Systemd Service File
```bash
sudo nano /etc/systemd/system/workforce-backend.service
```

Paste:

```ini
[Unit]
Description=GlobalSolutions FastAPI Backend Service
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=deployer
Group=deployer
WorkingDirectory=/home/deployer/app/backend
Environment="PATH=/home/deployer/app/backend/venv/bin:/usr/local/bin:/usr/bin"
EnvironmentFile=/home/deployer/app/backend/.env

# Gunicorn runs 4 Uvicorn workers bound to localhost 8000
ExecStart=/home/deployer/app/backend/venv/bin/gunicorn main:app \
    --workers 4 \
    --worker-class uvicorn.workers.UvicornWorker \
    --bind 127.0.0.1:8000 \
    --access-logfile /home/deployer/app/backend/access.log \
    --error-logfile /home/deployer/app/backend/error.log \
    --timeout 120 \
    --keep-alive 5

Restart=always
RestartSec=5s

NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

Save and exit (`Ctrl+O`, Enter, `Ctrl+X`).

### 6.2 Optional: RDP coordinator (Phase 4)

Lifecycle grace, Guacamole reconcile, and capacity repair should not run inside
every Gunicorn worker. Prefer a dedicated unit:

```bash
sudo cp /home/deployer/app/infrastructure/systemd/workforce-rdp-coordinator.service \
  /etc/systemd/system/workforce-rdp-coordinator.service
```

In `/home/deployer/app/backend/.env` set:

```ini
RDP_RUN_COORDINATOR_IN_API=false
RDP_DISCONNECT_GRACE_SECONDS=300
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl restart workforce-backend
sudo systemctl enable --now workforce-rdp-coordinator
sudo systemctl status workforce-rdp-coordinator
```

Until the unit is enabled, leave `RDP_RUN_COORDINATOR_IN_API=true` (default). Redis
leader election still ensures only one API worker performs coordinator ticks.

### 6.3 Start the API Service
```bash
sudo systemctl daemon-reload
sudo systemctl enable workforce-backend
sudo systemctl start workforce-backend
sudo systemctl status workforce-backend
```
Output should show: `Active: active (running)`.

### 6.4 Test Health Endpoint
```bash
curl -i http://127.0.0.1:8000/health
```
Should return `HTTP/1.1 200 OK` and `{"status":"ok"}`.

---

## Step 7: Configure Nginx Reverse Proxy & Free SSL

### 7.1 Set Up DNS Records
At your domain registrar (Cloudflare, Namecheap, etc.), create two `A` records pointing to your Hetzner VPS IPv4 address:

| Type | Hostname | Points To | Notes |
| :--- | :--- | :--- | :--- |
| **A** | `api` | `<HETZNER_IPV4>` | e.g. `api.yourdomain.com` |
| **A** | `guac` | `<HETZNER_IPV4>` | e.g. `guac.yourdomain.com` (DNS Only / No proxy in Cloudflare) |

### 7.2 Create Nginx Configuration
```bash
sudo rm -f /etc/nginx/sites-enabled/default
sudo nano /etc/nginx/sites-available/workforce-platform.conf
```

Paste the following (replace `yourdomain.com` with your real domain):

```nginx
# WebSocket connection upgrade mapping
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

# ── 1. FastAPI Backend (api.yourdomain.com) ────────────────────
server {
    listen 80;
    server_name api.yourdomain.com;

    client_max_body_size 50M;

    # ── RDP remote-desktop tunnel ──────────────────────────────
    # Must come before "location /" so it wins for this path.
    #
    # The browser's remote desktop is a long-lived WebSocket to FastAPI
    # (/rdp/{id}/ws-tunnel). The 120s read timeout used for normal API calls
    # would tear the desktop down after two quiet minutes, and Nginx's
    # response buffering adds visible lag to the canvas — so this path gets
    # its own block.
    location ~ ^/rdp/[^/]+/ws-tunnel$ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;

        proxy_buffering off;
        proxy_connect_timeout 60s;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;

        proxy_connect_timeout 60s;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }
}

# ── 2. Apache Guacamole Web Client (guac.yourdomain.com) ───────
server {
    listen 80;
    server_name guac.yourdomain.com;

    client_max_body_size 100M;

    # Phase 1 Safety — block public Guacamole REST that can dump
    # connection parameters (hostname/username/password) when a token
    # is presented. FastAPI must use GUACAMOLE_URL=http://127.0.0.1:8080/guacamole
    # so it bypasses this vhost. See infrastructure/nginx/guacamole-hardening.conf.
    location ~* ^/api/session/data/[^/]+/connections {
        return 404;
    }
    location ~* ^/api/session/data/[^/]+/activeConnections {
        return 404;
    }
    location ~* ^/api/session/data/[^/]+/users {
        return 404;
    }
    location ~* ^/api/session/data/[^/]+/userGroups {
        return 404;
    }

    # Phase 5 — join-ticket gate. A Guacamole token can only be minted by
    # spending a single-use ticket FastAPI issued for an open claim; the
    # token that comes back is scoped by guacamole-auth-json to that one
    # connection. Full annotated version, including the http{}-level
    # $guac_cors_origin map this needs:
    #   infrastructure/nginx/guacamole-join-ticket.conf
    # Omit these two blocks to stay on the proxied ws-tunnel.
    location = /_rdp_join_check {
        internal;
        proxy_pass              http://127.0.0.1:8000/rdp/gateway/verify-ticket;
        proxy_pass_request_body off;
        proxy_set_header        Content-Length "";
        proxy_set_header        X-Original-URI $request_uri;
        proxy_connect_timeout   3s;
        proxy_read_timeout      5s;
    }

    location = /api/tokens {
        auth_request /_rdp_join_check;

        add_header Access-Control-Allow-Origin $guac_cors_origin always;
        add_header Vary Origin always;

        proxy_pass         http://127.0.0.1:8080/guacamole/api/tokens;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    location / {
        # Guacamole container runs context under /guacamole/
        proxy_pass http://127.0.0.1:8080/guacamole/;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Guacamole tunnel depends heavily on WebSockets
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;

        proxy_buffering off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

> **After deploy (Phase 1 Safety):** rotate the Guacamole `guacadmin` password in the Guacamole UI **and** set the matching `GUACAMOLE_PASSWORD` in `/home/deployer/app/backend/.env`, then `sudo systemctl restart workforce-backend`. Assume any previously leaked admin token is burned. Keep `GUACAMOLE_URL` pointed at localhost Tomcat, not the public `guac.` hostname.

> **Guacamole admin UI (Phase 5):** the `auth_request` above means the public
> `guac.` login screen can no longer mint a token. That is intended — nobody
> should be logging into Guacamole over the internet. Administer it through an
> SSH tunnel instead:
> `ssh -L 8080:127.0.0.1:8080 deployer@<vps>`, then open `http://localhost:8080/guacamole`.

Save and exit (`Ctrl+O`, Enter, `Ctrl+X`).

### 7.4 Turn on the direct Guacamole canvas (Phase 5)

Until this is done, pixels are relayed by FastAPI: CPU grows with every live
desktop and an API restart drops every session. These steps move the canvas to
`guac.` while the control plane keeps deciding who may sit where.

```bash
# 1. One shared key for FastAPI and Guacamole.
python3 -c "import secrets; print(secrets.token_hex(16))"
```

2. Put that value in **both** places, identically:
   - `GUACAMOLE_JSON_SECRET_KEY` in `/home/deployer/app/backend/.env`
   - `GUACAMOLE_JSON_SECRET_KEY` in the infrastructure env file, which the
   Compose files pass to the container as `JSON_SECRET_KEY`.
   - Keep `JSON_ENABLED=true` on the Guacamole container. The repository
     Compose files set this explicitly. Do not add a fallback key to Compose.

3. Set `GUACAMOLE_PUBLIC_URL=https://guac.yourdomain.com` in the backend `.env`.

4. Add the `$guac_cors_origin` map at `http{}` level (see
   `infrastructure/nginx/guacamole-join-ticket.conf`) listing the origins the
   app is served from, then apply the two `location` blocks above. (On the single-VPS
   topology, `workforce_control_api` stays on localhost / the local upstream — do not
   retarget it to a second host.)

```bash
sudo nginx -t && sudo systemctl reload nginx
cd /home/deployer/app/infrastructure && docker compose up -d guacamole
docker compose logs --tail 100 guacamole
sudo systemctl restart workforce-backend
```

The log must not contain an authentication-extension configuration error.
`docker compose config` must show a non-empty `JSON_SECRET_KEY` and
`JSON_ENABLED: "true"`; do not print the key in tickets or logs.

5. **Pilot first.** Set `RDP_DIRECT_GATEWAY_MODE=pilot` and
   `RDP_DIRECT_GATEWAY_PILOT_EMAILS=` with one or two real workers, restart the
   backend, and watch them for a full shift. Everyone else keeps the proxied
   tunnel automatically — the two paths run side by side.

6. Verify with a pilot worker, in DevTools:
   - `POST /rdp/{id}/join-ticket` returns `"mode": "direct"`.
   - `POST https://guac…/api/tokens?rdp_ticket=…` returns `200`.
   - The desktop WebSocket is `wss://guac…/websocket-tunnel`, **not**
     `wss://api…/rdp/{id}/ws-tunnel`.
   - Replaying the same `rdp_ticket` a second time returns `403`.
   - `sudo systemctl restart workforce-backend` while the desktop is open: the
     picture keeps moving. That is the whole point of the phase.

7. When the pilot is clean, set `RDP_DIRECT_GATEWAY_MODE=on` and restart.

### 7.3 Enable Site and Issue SSL Certificate
```bash
sudo ln -s /etc/nginx/sites-available/workforce-platform.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Run certbot to obtain HTTPS certificates
sudo certbot --nginx -d api.yourdomain.com -d guac.yourdomain.com
```

Certbot will configure HTTPS redirects automatically. Confirm in your local browser that `https://api.yourdomain.com/health` returns `{"status":"ok"}`.

---

## Step 8: Deploy Next.js Frontend to Vercel

1. Log in to [Vercel](https://vercel.com) and click **Add New... > Project**.
2. Connect your GitHub repository.
3. In **Configure Project**:
   - **Framework Preset**: Next.js
   - **Root Directory**: Click Edit and select **`frontend`** *(⚠️ Mandatory)*
4. Under **Environment Variables**, add:

| Variable Name | Value | Purpose |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_API_URL` | `https://api.yourdomain.com` | Hetzner backend API |
| `NEXT_PUBLIC_GUACAMOLE_URL` | `https://guac.yourdomain.com` | Guacamole RDP gateway |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://your-project.supabase.co` | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | *(Your Supabase Anon / Public Key)* | Supabase Client SDK Key |
| `SESSION_COOKIE_SECRET` | *(Same hex string as in Hetzner `.env`)* | Signs session cookie |
| `OTP_PEPPER` | *(Same hex string as in Hetzner `.env`)* | Verifies cookie signature |
| `NEXT_PUBLIC_DEV_AUTH_BYPASS` | `false` | Production security |

5. Click **Deploy**.
6. Under **Project Settings > Domains**, assign your custom domain: `app.yourdomain.com` (point a `CNAME` record to `cname.vercel-dns.com`).

---

## Step 9: Link Frontend & Backend Together

1. On your Hetzner VPS, update `ALLOWED_ORIGINS` in `/home/deployer/app/backend/.env` to include both your custom frontend domain and the default Vercel domain:
   ```ini
   ALLOWED_ORIGINS=["https://app.yourdomain.com", "https://your-frontend.vercel.app"]
   ```
2. Restart backend:
   ```bash
   sudo systemctl restart workforce-backend
   ```
3. How requests route:
   - When a user visits `https://app.yourdomain.com`, `next.config.js` transparently rewrites `/api/*` requests to `https://api.yourdomain.com/*`.
   - Because of this rewrite, authentication cookies are preserved first-party without cross-domain browser blocking.

---

## Step 10: End-to-End Verification Checklist

Run through these checks to verify 100% operational status:

- [ ] **Backend Health**: `curl -i https://api.yourdomain.com/health` returns `200 OK`.
- [ ] **Redis Connection**: `docker exec -it infrastructure-redis-1 redis-cli ping` returns `PONG`.
- [ ] **Guacamole Web**: Opening `https://guac.yourdomain.com` shows the Guacamole login screen.
- [ ] **Frontend Loading**: Visiting `https://app.yourdomain.com/login` loads styles and login form cleanly.
- [ ] **Authentication**: Log in with credentials; verify the `gs_session` cookie is created with `HttpOnly` and `Secure` flags.
- [ ] **RDP Session Flow**:
  1. Open admin portal (`/admin/rdp`), add a test machine with a Windows IP on port 3389.
  2. Create the matching connection in Guacamole (`guacadmin`).
  3. Log in as a worker, claim the machine on `/worker/rdp-claim-board`, and verify the browser canvas displays the remote desktop.

---

## Routine Maintenance & Updating Code

### Updating the Backend (Hetzner)

This is the command sequence to use every time the VPS is behind `main`.
Live repo path on the current host:

`/home/deployer/app/Workforce-Allocation-Platform`

```bash
ssh deployer@<YOUR_SERVER_IP>

cd /home/deployer/app/Workforce-Allocation-Platform
git pull origin main

cd backend
source venv/bin/activate
pip install -r requirements.txt
alembic upgrade head

sudo systemctl restart workforce-backend
sudo systemctl status workforce-backend --no-pager

# Confirm migrations and API health
alembic current
curl -s http://127.0.0.1:8000/health
```

Expect `alembic current` to print a revision ending in `(head)`, and health to return `{"status":"ok"}`.

### Updating the Frontend (Vercel)
Any git push to your `main` branch automatically triggers Vercel to build and deploy the `frontend/` directory with zero downtime.

### Viewing Live Logs on Hetzner
```bash
# Follow backend FastAPI logs
journalctl -u workforce-backend -f --no-pager

# Follow Nginx access / error logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Follow Docker container logs
cd /home/deployer/app/Workforce-Allocation-Platform/infrastructure
docker compose logs -f guacd
docker compose logs -f redis
```

---

## Troubleshooting Common Issues

### 1. `502 Bad Gateway` on `api.yourdomain.com`
- Check `journalctl -u workforce-backend -n 50 --no-pager`.
- **Cause A**: `DATABASE_URL` is wrong or Supabase password contains special characters that need URL encoding.
- **Cause B**: `DEV_AUTH_BYPASS` is true when `ENVIRONMENT=production`. Production security validator purposely halts the app if bypass is left on.
- **Cause C**: `SESSION_COOKIE_SECRET` or `OTP_PEPPER` is blank.

### 2. CORS Error in Browser Console
- Check `ALLOWED_ORIGINS` in `/home/deployer/app/backend/.env`.
- Ensure exact protocol and host match without trailing slash (e.g. `https://app.yourdomain.com`).
- Restart backend after modifying `.env`: `sudo systemctl restart workforce-backend`.

### 3. Immediate Redirect Back to `/login`
- `SESSION_COOKIE_SECRET` in `backend/.env` on Hetzner does not match `SESSION_COOKIE_SECRET` in Vercel environment variables.
- They must be identical byte-for-byte strings.

### 4. Guacamole Desktop Screen is Black or Disconnects
- Verify port 3389 on the target Windows machine is reachable from your Hetzner VPS:
  ```bash
  nc -zv <WINDOWS_MACHINE_IP> 3389
  ```
- If this times out, the Windows Firewall or cloud network security group is blocking port 3389 from the Hetzner server's public IP.
- Confirm Nginx includes the WebSocket upgrade headers (`Upgrade $http_upgrade;` and `Connection $connection_upgrade;`).
- Read what guacd actually said — this is the fastest way to tell a machine
  problem from a platform problem:
  ```bash
  docker compose logs --tail 40 guacd
  ```
  - `Error connecting to RDP server` / auth failure → wrong host or credentials.
    Fix them on **Admin → RDP Resource Management**, then press **Sync Guacamole**.
  - `User is not responding` → guacd is drawing frames but the browser's
    acknowledgements are not getting back. That is the WebSocket path, not the
    machine: check the `ws-tunnel` Nginx block below and the backend logs.
  - No RDP errors at all but a black canvas → the tunnel never delivered frames.

### 5. Remote Desktop Drops After ~2 Minutes
The RDP canvas is a long-lived WebSocket to FastAPI at `/rdp/{id}/ws-tunnel`.
If it is served by the generic `location /` block with `proxy_read_timeout 120s`,
Nginx closes the connection after two quiet minutes and the desktop goes black.

Confirm the dedicated `location ~ ^/rdp/[^/]+/ws-tunnel$` block is present in the
`api.yourdomain.com` server (it sets `proxy_read_timeout 3600s` and
`proxy_buffering off`), then `sudo nginx -t && sudo systemctl reload nginx`.

### 6. Remote Desktop Works Locally But Not on Vercel
Vercel rewrites HTTP but **does not proxy WebSocket upgrades**. The viewer
therefore connects straight to `NEXT_PUBLIC_API_URL` in production instead of
going through `/api/*`. Check that:
- `NEXT_PUBLIC_API_URL` is set in Vercel to `https://api.yourdomain.com`.
- That host has a valid TLS certificate — browsers refuse `wss://` to an
  untrusted certificate, with no useful error in the console.

---

*This document is the sole production runbook for the Workforce Allocation Platform.*
