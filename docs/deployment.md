# Complete Production Deployment Guide: Hetzner Backend & Vercel Frontend

This guide is a step-by-step, beginner-friendly manual for deploying the **Workforce Allocation Platform** to production. 

You will host the **Backend & Infrastructure** (FastAPI, PostgreSQL, Redis, Apache Guacamole, Uptime Kuma) on a high-performance **Hetzner Cloud VPS**, and host the **Frontend** (Next.js 14) on **Vercel's global edge network**.

---

## Table of Contents
1. [Architecture & How the Pieces Connect](#1-architecture--how-the-pieces-connect)
2. [Prerequisites Checklist](#2-prerequisites-checklist)
3. [Step 1: Provision & Secure Your Hetzner Server](#step-1-provision--secure-your-hetzner-server)
4. [Step 2: Install Required Server Software](#step-2-install-required-server-software)
5. [Step 3: Set Up PostgreSQL Database](#step-3-set-up-postgresql-database)
6. [Step 4: Launch Docker Services (Redis, Guacamole, Uptime Kuma)](#step-4-launch-docker-services-redis-guacamole-uptime-kuma)
7. [Step 5: Deploy the FastAPI Backend](#step-5-deploy-the-fastapi-backend)
8. [Step 6: Configure Systemd (Keep Backend Running 24/7)](#step-6-configure-systemd-keep-backend-running-247)
9. [Step 7: Configure Nginx Reverse Proxy & Let's Encrypt SSL](#step-7-configure-nginx-reverse-proxy--lets-encrypt-ssl)
10. [Step 8: Deploy the Frontend to Vercel](#step-8-deploy-the-frontend-to-vercel)
11. [Step 9: Link Frontend & Backend Together](#step-9-link-frontend--backend-together)
12. [Step 10: Verification & Smoke Test](#step-10-verification--smoke-test)
13. [Ongoing Maintenance & Updates](#ongoing-maintenance--updates)
14. [Troubleshooting Common Issues](#troubleshooting-common-issues)

---

## 1. Architecture & How the Pieces Connect

Before typing commands, understand how the system is structured:

```
                            ┌───────────────────────────────────┐
                            │          USER BROWSER             │
                            └───────┬───────────────────┬───────┘
                                    │                   │
                  1. Web App Traffic│                   │ 3. Direct RDP WebSockets
                 (HTML / CSS / JS)  │                   │    & API calls
                                    ▼                   ▼
                     ┌───────────────────────┐ ┌─────────────────────────────────┐
                     │     VERCEL EDGE       │ │        HETZNER CLOUD VPS        │
                     │  (Next.js 14 Frontend)│ │                                 │
                     │  app.yourdomain.com   │ │  api.yourdomain.com (Nginx 443) │
                     └──────────┬────────────┘ └───────────────┬─────────────────┘
                                │                              │
                                │ 2. Rewrites / Server Fetch   │ Nginx Reverse Proxy
                                └──────────────────────────────┼─────────────────┐
                                                               │                 │
                                                               ▼                 ▼
                                                    ┌────────────────────┐ ┌───────────────┐
                                                    │ FastAPI (Port 8000)│ │ Guacamole     │
                                                    │ Gunicorn + Uvicorn │ │ (Port 8080)   │
                                                    └─────────┬──────────┘ └───────┬───────┘
                                                              │                    │
                                      ┌───────────────────────┼────────────────────┤
                                      ▼                       ▼                    ▼
                               ┌──────────────┐        ┌─────────────┐     ┌───────────────┐
                               │  PostgreSQL  │        │ Redis Cache │     │  Uptime Kuma  │
                               │  (Port 5432) │        │ (Port 6379) │     │  (Port 3001)  │
                               └──────────────┘        └─────────────┘     └───────────────┘
```

- **Frontend on Vercel**: Delivers ultra-fast UI loading across the globe. Next.js App Router renders pages and delegates secure authentication and API requests to the backend.
- **Backend on Hetzner**: Runs the FastAPI application, long-running worker loops (RDP lifecycle timeouts, email dispatch queues), Apache Guacamole RDP tunneling, and Uptime Kuma TCP health checks.
- **Nginx on Hetzner**: Acts as the front door (ports 80 and 443). It terminates SSL encryption (HTTPS) with free Let's Encrypt certificates and forwards traffic to FastAPI, Guacamole, or Uptime Kuma.

---

## 2. Prerequisites Checklist

Ensure you have the following ready before starting:

| Requirement | Description | Recommendation |
| :--- | :--- | :--- |
| **Hetzner Cloud Account** | To create the backend virtual private server (VPS). | [hetzner.com/cloud](https://www.hetzner.com/cloud) |
| **Vercel Account** | To host the Next.js frontend. | [vercel.com](https://vercel.com) |
| **GitHub Account** | Hosting the code repository. | Connected to Vercel |
| **Custom Domain** | e.g. `yourdomain.com` | Cloudflare, Namecheap, GoDaddy |
| **Firebase Project** | For authentication and storage keys. | [console.firebase.google.com](https://console.firebase.google.com) |
| **Local SSH Client** | Terminal on Mac/Linux or PowerShell on Windows 10/11. | Built-in |

---

## Step 1: Provision & Secure Your Hetzner Server

### 1.1 Create the Server in Hetzner Cloud Console
1. Log in to [Hetzner Cloud Console](https://console.hetzner.cloud/).
2. Click **New Project** and name it `globalsolutions-prod`.
3. Click **Add Server**:
   - **Location**: Choose the location nearest to your workers (e.g. Falkenstein/Nuremberg for Europe/Africa, or Ashburn for Americas).
   - **Image**: **Ubuntu 24.04 LTS** (or Ubuntu 22.04 LTS).
   - **Type**: **Standard (x86)** or **Dedicated**.
     - Recommended minimum: **CPX21** (3 vCPU AMD, 4 GB RAM) or **CPX31** (4 vCPU AMD, 8 GB RAM if you plan on 50+ concurrent Guacamole sessions).
   - **Networking**: Public IPv4 + IPv6.
   - **SSH Key**: Click **Add SSH Key** and paste your public key (`~/.ssh/id_rsa.pub` or `~/.ssh/id_ed25519.pub`). If you don't have one, generate it locally via:
     ```powershell
     ssh-keygen -t ed25519 -C "admin@yourdomain.com"
     ```
   - **Name**: `workforce-backend-prod`.
4. Click **Create & Buy now**. Note down the assigned **IPv4 Address** (e.g., `195.201.85.100`).

---

### 1.2 First Login via SSH
From your local computer terminal (PowerShell or Bash):

```bash
ssh root@<YOUR_SERVER_IP>
```
*(Replace `<YOUR_SERVER_IP>` with your real Hetzner IPv4 address).*

---

### 1.3 Update the Server Packages
Always update the package repository index and installed software first:

```bash
sudo apt update && sudo apt upgrade -y
```
- `apt update`: Downloads the latest package lists from Ubuntu repositories.
- `apt upgrade -y`: Installs new package versions without asking for confirmation.

---

### 1.4 Create a Dedicated Deployer User
Never run your production web application as the `root` superuser. Create a user named `deployer`:

```bash
# 1. Create the user with home directory and bash shell
sudo adduser --gecos "" deployer

# 2. Add deployer to the sudo group (grants admin rights when needed)
sudo usermod -aG sudo deployer

# 3. Copy SSH authorization from root so you can log in as deployer
sudo mkdir -p /home/deployer/.ssh
sudo cp /root/.ssh/authorized_keys /home/deployer/.ssh/
sudo chown -R deployer:deployer /home/deployer/.ssh
sudo chmod 700 /home/deployer/.ssh
sudo chmod 600 /home/deployer/.ssh/authorized_keys
```

Now, open a new terminal window on your local machine and verify you can connect as `deployer`:
```bash
ssh deployer@<YOUR_SERVER_IP>
```
Once connected, switch back to your initial session or continue from this `deployer` session.

---

### 1.5 Configure the UFW Firewall
Secure the server by allowing only necessary ports:

```bash
# 1. Allow SSH connections (port 22) so you don't lock yourself out
sudo ufw allow OpenSSH

# 2. Allow HTTP (80) and HTTPS (443) for Nginx
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# 3. Enable the firewall
sudo ufw enable
```
Press `y` and Enter when prompted. Check the firewall status:
```bash
sudo ufw status
```
*Note: Ports `8000` (FastAPI), `5432` (PostgreSQL), `6379` (Redis), and `8080` (Guacamole) remain internal-only for security and are not opened to the public internet.*

---

## Step 2: Install Required Server Software

Run the following commands on the Hetzner server to install Python, Git, Docker, and Nginx.

### 2.1 Install Python 3.12, Virtualenv, and Build Tools
```bash
sudo apt install -y python3 python3-pip python3-venv git curl build-essential libpq-dev
```
- `python3-venv`: Enables isolated virtual environments for Python packages.
- `libpq-dev`: Required to compile and build the PostgreSQL driver `psycopg2-binary`.
- `build-essential`: Includes gcc and compiler utilities.

---

### 2.2 Install Docker and Docker Compose
Docker runs Redis, Guacamole, and Uptime Kuma cleanly in containers:

```bash
# 1. Install Docker prerequisites
sudo apt install -y ca-certificates curl gnupg

# 2. Add Docker's official GPG key
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# 3. Add the Docker repository to APT sources
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# 4. Install Docker Engine and the Docker Compose plugin
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 5. Allow deployer to run docker without sudo
sudo usermod -aG docker deployer
```

Log out and log back in (or run `newgrp docker`) for group permissions to take effect:
```bash
newgrp docker
docker --version
docker compose version
```

---

### 2.3 Install Nginx Web Server
```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```
- `nginx`: High-performance HTTP server and reverse proxy.
- `certbot` & `python3-certbot-nginx`: Automatically provisions and renews free Let's Encrypt SSL certificates.

---

## Step 3: Set Up PostgreSQL Database

You have two paths for your primary application database:
- **Option A (Self-Hosted on Hetzner - Recommended for all-in-one simplicity)**: Install PostgreSQL directly on the server.
- **Option B (Managed Supabase)**: Use Supabase's hosted PostgreSQL.

### Option A: Install PostgreSQL on Hetzner
```bash
# 1. Install PostgreSQL and contrib package
sudo apt install -y postgresql postgresql-contrib

# 2. Start and enable PostgreSQL service
sudo systemctl enable postgresql
sudo systemctl start postgresql

# 3. Create the database user and application database
# Note: Choose a strong password to replace 'YourSuperSecretPasswordHere'
sudo -u postgres psql <<EOF
CREATE DATABASE workforceallocationdb;
CREATE USER gs_user WITH ENCRYPTED PASSWORD 'YourSuperSecretPasswordHere';
GRANT ALL PRIVILEGES ON DATABASE workforceallocationdb TO gs_user;
ALTER DATABASE workforceallocationdb OWNER TO gs_user;
\c workforceallocationdb
GRANT ALL ON SCHEMA public TO gs_user;
EOF
```

Your database connection string is now:
```
postgresql://gs_user:YourSuperSecretPasswordHere@localhost:5432/workforceallocationdb
```

### Option B: Using Supabase
If you are using Supabase, copy the **Transaction Pooler** connection string (port `6543`) from your Supabase Dashboard under `Project Settings > Database > Connection pooling`:
```
postgresql://postgres.<project-ref>:<db-password>@aws-0-<region>.pooler.supabase.com:6543/postgres?sslmode=require
```
*(When using Supabase transaction pooler on port 6543, set `DATABASE_USE_PGBOUNCER=true` in `.env`)*.

---

## Step 4: Launch Docker Services (Redis, Guacamole, Uptime Kuma)

The platform infrastructure relies on Docker Compose for:
1. **Redis**: Manages RDP claim locks and session heartbeats.
2. **Guacamole Daemon (`guacd`) & Web**: In-browser Windows RDP gateway.
3. **Guacamole DB (`guac_db`)**: Dedicated internal Postgres database for Guacamole connections.
4. **Uptime Kuma**: Pings RDP machines on port 3389 and fires status webhooks.

### 4.1 Clone the Repository onto Hetzner
As the `deployer` user:

```bash
cd /home/deployer
git clone https://github.com/YOUR_GITHUB_USERNAME/YOUR_REPO_NAME.git app
cd /home/deployer/app
```
*(If the repository is private, create a GitHub Personal Access Token or add an SSH deploy key from `/home/deployer/.ssh/id_ed25519.pub` to your GitHub repo's Deploy Keys).*

---

### 4.2 Generate the Guacamole Database Init Script
Apache Guacamole requires a database schema to store RDP configurations:

```bash
cd /home/deployer/app/infrastructure

# Run the official Guacamole image to export the PostgreSQL initialization schema
docker run --rm guacamole/guacamole /opt/guacamole/bin/initdb.sh --postgresql > guacamole_initdb.sql

# Verify the file was created and is not empty (should be ~40KB+)
ls -lh guacamole_initdb.sql
```

---

### 4.3 Configure and Start Docker Containers
Check `infrastructure/docker-compose.yml`. In production, ensure the Guacamole credentials are secure:

```bash
# Start all containers in the background
docker compose up -d
```

Verify that all 5 containers are running:
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

---

## Step 5: Deploy the FastAPI Backend

### 5.1 Set Up the Python Virtual Environment
```bash
cd /home/deployer/app/backend

# Create a virtual environment named 'venv'
python3 -m venv venv

# Activate the virtual environment
source venv/bin/activate

# Upgrade pip
pip install --upgrade pip

# Install production dependencies including Gunicorn
pip install -r requirements.txt
pip install gunicorn
```

---

### 5.2 Create the Production `backend/.env` File
Create `/home/deployer/app/backend/.env`:

```bash
nano /home/deployer/app/backend/.env
```

Paste and adjust the following production configuration:

```ini
# ── Environment ───────────────────────────────────────────────
ENVIRONMENT=production
LOG_LEVEL=INFO

# Replace with your actual Vercel domain and custom domain
ALLOWED_ORIGINS=["https://app.yourdomain.com", "https://your-frontend.vercel.app"]

# Development bypass MUST be false in production
DEV_AUTH_BYPASS=false
DEV_AUTH_ROLE=user

# ── Database ──────────────────────────────────────────────────
# Use the password you created in Step 3
DATABASE_URL=postgresql://gs_user:YourSuperSecretPasswordHere@localhost:5432/workforceallocationdb
DATABASE_USE_PGBOUNCER=false

# ── Redis ─────────────────────────────────────────────────────
# Connects to the Redis container running on port 6379
REDIS_URL=redis://localhost:6379/0

# ── Authentication & Security ────────────────────────────────
# Generate a random 64-character secret using: openssl rand -hex 32
# NOTE: This MUST match SESSION_COOKIE_SECRET in Vercel!
SESSION_COOKIE_SECRET=paste_long_random_64_character_hex_string_here
OTP_PEPPER=paste_another_long_random_64_character_hex_string_here

# ── Supabase Auth Config (if using Supabase Auth) ────────────
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your_supabase_service_role_key
SUPABASE_JWKS_URL=https://your-project.supabase.co/auth/v1/.well-known/jwks.json

# ── Firebase Admin SDK (if using Firebase Auth/Firestore) ─────
FIREBASE_CREDENTIALS_PATH=./firebase-service-account.json
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_DATABASE_URL=https://your-firebase-project-default-rtdb.firebaseio.com

# ── Apache Guacamole ──────────────────────────────────────────
# Guacamole container running on port 8080
GUACAMOLE_URL=http://localhost:8080/guacamole
GUACAMOLE_USERNAME=guacadmin
GUACAMOLE_PASSWORD=guacadmin

# ── Uptime Kuma ───────────────────────────────────────────────
UPTIME_KUMA_URL=http://localhost:3001
UPTIME_KUMA_WEBHOOK_SECRET=paste_random_secret_token_here

# ── Outbound Email (Resend) ───────────────────────────────────
RESEND_API_KEY=re_your_resend_api_key_here
RESEND_FROM_EMAIL=GlobalSolutions <noreply@yourdomain.com>
RESEND_WEBHOOK_SECRET=
APP_BASE_URL=https://app.yourdomain.com
EMAIL_DISPATCH_ENABLED=true

# ── AI Insights (Gemini) ──────────────────────────────────────
GOOGLE_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3.6-flash
```

Save and exit (`Ctrl+O`, Enter, `Ctrl+X`).

> **Security Note on Firebase Credentials**:
> If using Firebase, upload your `firebase-service-account.json` to `/home/deployer/app/backend/firebase-service-account.json`. Ensure file permissions are restricted:
> ```bash
> chmod 600 /home/deployer/app/backend/firebase-service-account.json
> ```

---

### 5.3 Run Database Migrations (Alembic)
Apply all database tables and constraints using Alembic:

```bash
cd /home/deployer/app/backend
source venv/bin/activate
alembic upgrade head
```
Expected output:
```
INFO  [alembic.runtime.migration] Context impl PostgresqlImpl.
INFO  [alembic.runtime.migration] Will assume transactional DDL.
INFO  [alembic.runtime.migration] Running upgrade  -> 24cc3a8f148d, initial_schema
...
INFO  [alembic.runtime.migration] Running upgrade ... -> <latest_revision>
```

---

## Step 6: Configure Systemd (Keep Backend Running 24/7)

Systemd ensures your FastAPI backend starts automatically upon server reboots and restarts if any crash occurs.

### 6.1 Create the Systemd Service File
```bash
sudo nano /etc/systemd/system/workforce-backend.service
```

Paste the following configuration:

```ini
[Unit]
Description=GlobalSolutions FastAPI Backend Service
After=network.target postgresql.service docker.service
Requires=docker.service

[Service]
Type=simple
User=deployer
Group=deployer
WorkingDirectory=/home/deployer/app/backend
Environment="PATH=/home/deployer/app/backend/venv/bin:/usr/local/bin:/usr/bin"
EnvironmentFile=/home/deployer/app/backend/.env

# Gunicorn runs 4 Uvicorn worker processes bound to localhost port 8000
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

# Security hardening
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

Save and exit (`Ctrl+O`, Enter, `Ctrl+X`).

---

### 6.2 Enable and Start the Service
```bash
# 1. Reload systemd daemon to discover the new service
sudo systemctl daemon-reload

# 2. Enable the service so it starts on system boot
sudo systemctl enable workforce-backend

# 3. Start the service immediately
sudo systemctl start workforce-backend

# 4. Check the service status
sudo systemctl status workforce-backend
```

You should see `Active: active (running)`.

### 6.3 Test the Local Endpoint
Check that the backend responds to a health probe:
```bash
curl -i http://127.0.0.1:8000/health
```
Expected response:
```http
HTTP/1.1 200 OK
content-type: application/json

{"status":"ok"}
```

---

## Step 7: Configure Nginx Reverse Proxy & Let's Encrypt SSL

Nginx accepts incoming requests on port 80/443 and securely proxies them:
- `api.yourdomain.com` ➔ FastAPI Backend (`127.0.0.1:8000`)
- `guac.yourdomain.com` ➔ Guacamole RDP Gateway (`127.0.0.1:8080`)
- `status.yourdomain.com` ➔ Uptime Kuma Dashboard (`127.0.0.1:3001`) *(Optional)*

### 7.1 Configure DNS Records at Your Domain Registrar
Log into your DNS provider (Cloudflare, Namecheap, GoDaddy, etc.) and add `A` records pointing to your Hetzner server IPv4 address:

| Type | Name | Content / Target | TTL | Proxy status |
| :--- | :--- | :--- | :--- | :--- |
| **A** | `api` | `<YOUR_HETZNER_IPV4>` | Automatic / 300 | DNS Only (Grey Cloud in Cloudflare) |
| **A** | `guac` | `<YOUR_HETZNER_IPV4>` | Automatic / 300 | DNS Only (WebSocket compatibility) |

*(Wait 2–5 minutes for DNS propagation before running Certbot).*

---

### 7.2 Create the Nginx Configuration
Remove the default site and create a custom config:

```bash
sudo rm -f /etc/nginx/sites-enabled/default
sudo nano /etc/nginx/sites-available/workforce-platform.conf
```

Paste the following Nginx configuration (replace `yourdomain.com` with your actual domain):

```nginx
# Map for WebSocket connection upgrade
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

# ── 1. API Backend (api.yourdomain.com) ────────────────────────
server {
    listen 80;
    server_name api.yourdomain.com;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support (for active session updates)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;

        proxy_connect_timeout 60s;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }
}

# ── 2. Guacamole Web Client (guac.yourdomain.com) ──────────────
server {
    listen 80;
    server_name guac.yourdomain.com;

    client_max_body_size 100M;

    location / {
        # Guacamole runs under /guacamole context
        proxy_pass http://127.0.0.1:8080/guacamole/;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Guacamole tunnel relies heavily on WebSockets
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;

        proxy_buffering off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

Save and exit (`Ctrl+O`, Enter, `Ctrl+X`).

---

### 7.3 Enable the Site and Test Configuration
```bash
# Link the site to sites-enabled
sudo ln -s /etc/nginx/sites-available/workforce-platform.conf /etc/nginx/sites-enabled/

# Test syntax
sudo nginx -t
```
You should see:
```
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

Reload Nginx:
```bash
sudo systemctl reload nginx
```

---

### 7.4 Obtain Free Let's Encrypt SSL Certificates
Run Certbot to automatically configure HTTPS:

```bash
sudo certbot --nginx -d api.yourdomain.com -d guac.yourdomain.com
```

- Enter your email address for urgent security/renewal notices.
- Agree to terms (`y`).
- Certbot will obtain certificates, configure HTTPS redirects in Nginx, and reload the server automatically.

Verify renewal works:
```bash
sudo certbot renew --dry-run
```

Now, visit `https://api.yourdomain.com/health` in your browser. It should show:
```json
{"status":"ok"}
```

---

## Step 8: Deploy the Frontend to Vercel

The frontend is a Next.js 14 App Router application located inside the `frontend/` directory of the repository.

### 8.1 Import the Repository into Vercel
1. Log in to [Vercel](https://vercel.com).
2. Click **Add New...** ➔ **Project**.
3. Select your GitHub repository containing the platform.

---

### 8.2 Configure Project Settings in Vercel
In the **Configure Project** screen:

1. **Framework Preset**: Ensure **Next.js** is selected.
2. **Root Directory**: Click **Edit** and set it to:
   ```
   frontend
   ```
   *(⚠️ Critical: Do not leave Root Directory as `./`. It must be `frontend`).*
3. **Build Command**: `next build` (leave default).
4. **Output Directory**: `.next` (leave default).
5. **Install Command**: `npm install` (leave default).

---

### 8.3 Set Up Environment Variables in Vercel
Under the **Environment Variables** section, add the following variables for **Production**, **Preview**, and **Development**:

| Variable Name | Example Value | Notes |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_API_URL` | `https://api.yourdomain.com` | Points to your Hetzner backend |
| `NEXT_PUBLIC_GUACAMOLE_URL` | `https://guac.yourdomain.com` | Points to your Guacamole subdomain |
| `SESSION_COOKIE_SECRET` | *(Same secret as in backend `.env`)* | Required for signed HttpOnly session cookie |
| `OTP_PEPPER` | *(Same secret as in backend `.env`)* | Required for session verification |
| `NEXT_PUBLIC_DEV_AUTH_BYPASS` | `false` | Must be `false` in production |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `AIzaSy...` | From Firebase Console Web App |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `your-app.firebaseapp.com` | From Firebase Console |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `your-app` | From Firebase Console |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`| `your-app.firebasestorage.app` | From Firebase Console |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`| `123456789...` | From Firebase Console |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `1:123456:web:...` | From Firebase Console |

> **Crucial Rule**: `SESSION_COOKIE_SECRET` and `OTP_PEPPER` must be **exact byte-for-byte duplicates** of the ones inside `/home/deployer/app/backend/.env`. The backend signs the session cookie upon login, and Vercel's Next.js middleware verifies that signature.

Click **Deploy**. Vercel will build and deploy the application.

---

### 8.4 Assign a Custom Domain in Vercel
1. Go to **Project Settings > Domains** in Vercel.
2. Add `app.yourdomain.com` (or `workforce.yourdomain.com`).
3. Add the `CNAME` record in your DNS provider:
   - **Type**: `CNAME`
   - **Name**: `app`
   - **Target**: `cname.vercel-dns.com`
4. Vercel will automatically provision an SSL certificate for your frontend.

---

## Step 9: Link Frontend & Backend Together

Now that both systems are live, configure the two-way bridge:

### 9.1 Update `ALLOWED_ORIGINS` in the Backend
Connect to your Hetzner VPS and update `ALLOWED_ORIGINS` in `backend/.env` with your Vercel domains:

```bash
nano /home/deployer/app/backend/.env
```

Ensure `ALLOWED_ORIGINS` includes both the Vercel deployment URL and your custom domain:
```ini
ALLOWED_ORIGINS=["https://app.yourdomain.com", "https://your-project.vercel.app"]
```

Save and exit (`Ctrl+O`, Enter, `Ctrl+X`).

Restart the backend to apply changes:
```bash
sudo systemctl restart workforce-backend
```

---

### 9.2 How the Next.js Rewrites Work
The frontend repository's `frontend/next.config.js` contains built-in API proxying:

```javascript
async rewrites() {
  const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
  const guacamoleUrl = process.env.NEXT_PUBLIC_GUACAMOLE_URL || 'http://localhost:8080/guacamole';
  return [
    {
      source: '/api/:path*',
      destination: `${backendUrl}/:path*`,
    },
    {
      source: '/remote/:path*',
      destination: `${guacamoleUrl}/:path*`,
    },
  ];
}
```

This means:
1. When the user visits `https://app.yourdomain.com`, all calls to `/api/workers`, `/api/shifts`, etc., are securely rewritten to `https://api.yourdomain.com/...`.
2. Cookies are transmitted without cross-site third-party cookie restrictions.
3. The Guacamole canvas connects smoothly through `/remote/`.

---

## Step 10: Verification & Smoke Test

Perform this checklist to confirm the entire deployment is working:

### 1. Test Backend Health Check
```bash
curl -i https://api.yourdomain.com/health
```
Response must be `200 OK` with `{"status":"ok"}`.

### 2. Test Frontend Access
Open `https://app.yourdomain.com/login` in your browser. Confirm:
- CSS and UI load cleanly without missing styles.
- Browser Developer Console (F12) shows no red CORS or 404 errors.

### 3. Test Authentication & Session Cookie
1. Log in with an admin or worker credential.
2. Check your browser cookies under Developer Tools ➔ Application ➔ Cookies:
   - Ensure the cookie `gs_session` is present and flagged as `HttpOnly` and `Secure`.
3. Navigate to `/worker/dashboard` or `/admin/dashboard`. The route should load without redirecting back to `/login`.

### 4. Test RDP & Guacamole Tunneling
1. In the admin portal, register an active RDP machine.
2. Link the machine's Guacamole connection ID.
3. Open the Worker portal, claim the machine, and verify the Remote Desktop screen loads in the browser canvas.

---

## Ongoing Maintenance & Updates

### How to Update the Backend
Whenever you push new code to your repository:

```bash
# 1. Connect to Hetzner
ssh deployer@<YOUR_SERVER_IP>

# 2. Pull latest code
cd /home/deployer/app
git pull origin main

# 3. Apply database migrations if any changed
cd /home/deployer/app/backend
source venv/bin/activate
pip install -r requirements.txt
alembic upgrade head

# 4. Restart the backend service
sudo systemctl restart workforce-backend

# 5. Check logs to ensure clean startup
journalctl -u workforce-backend -n 50 --no-pager
```

### How to Update the Frontend
Frontend updates are fully automated:
- Push commits to your GitHub repository `main` branch.
- Vercel automatically detects changes in `frontend/`, triggers a new build, and deploys with zero downtime.

---

### How to View Logs on Hetzner
```bash
# Follow live backend logs
journalctl -u workforce-backend -f

# Follow Nginx access logs
sudo tail -f /var/log/nginx/access.log

# Follow Nginx error logs
sudo tail -f /var/log/nginx/error.log

# Follow Docker container logs (e.g. Guacamole or Redis)
cd /home/deployer/app/infrastructure
docker compose logs -f guacamole
docker compose logs -f redis
```

---

### Automated Database Backups
To protect your PostgreSQL database, set up a daily automated backup script:

```bash
# Create backups directory
mkdir -p /home/deployer/backups

# Create backup script
nano /home/deployer/backup_db.sh
```

Paste the following:
```bash
#!/bin/bash
BACKUP_DIR="/home/deployer/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="$BACKUP_DIR/workforce_db_$TIMESTAMP.sql.gz"

pg_dump -U gs_user -h localhost workforceallocationdb | gzip > "$FILENAME"

# Delete backups older than 14 days
find "$BACKUP_DIR" -type f -name "*.sql.gz" -mtime +14 -delete
```

Make it executable and add to crontab:
```bash
chmod +x /home/deployer/backup_db.sh

# Open crontab editor
crontab -e
```
Add this line to run daily at 2:00 AM:
```cron
0 2 * * * /home/deployer/backup_db.sh
```

---

## Troubleshooting Common Issues

### Issue 1: `502 Bad Gateway` from Nginx
- **Cause**: The FastAPI backend is not running or crashed on startup.
- **Fix**: Check `journalctl -u workforce-backend -n 50 --no-pager`. Common causes include:
  - Wrong database password in `DATABASE_URL`.
  - Missing secret key (`SESSION_COOKIE_SECRET` or `OTP_PEPPER`).
  - Production safety check triggered (`DEV_AUTH_BYPASS` set to true in production).

### Issue 2: CORS Error in Browser Console (`Access-Control-Allow-Origin`)
- **Cause**: The frontend URL is not listed in `ALLOWED_ORIGINS` in `backend/.env`.
- **Fix**: Open `backend/.env`, add your Vercel URL (e.g. `https://app.yourdomain.com`), and run `sudo systemctl restart workforce-backend`.

### Issue 3: Endless Login Redirect Loop
- **Cause**: `SESSION_COOKIE_SECRET` mismatch between `backend/.env` and Vercel environment variables.
- **Fix**: Copy the exact string from `backend/.env` into Vercel's `SESSION_COOKIE_SECRET` environment variable and redeploy the frontend.

### Issue 4: Guacamole Screen Shows Black or Disconnects
- **Cause**: WebSocket connection failed or remote Windows RDP port 3389 is blocked.
- **Fix**:
  1. Confirm Nginx config has `proxy_set_header Upgrade $http_upgrade;` and `proxy_set_header Connection $connection_upgrade;`.
  2. Test if the Windows machine port 3389 is reachable from the server:
     ```bash
     nc -zv <WINDOWS_MACHINE_IP> 3389
     ```
  3. Verify `infrastructure-guacd-1` container status: `docker compose ps`.

---

*Congratulations! Your Workforce Allocation Platform is now securely deployed and running across Hetzner Cloud and Vercel.*
