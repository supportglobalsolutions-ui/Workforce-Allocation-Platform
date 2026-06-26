# How to Run the Backend
## GlobalSolutions — Kelvin's Dev Guide

Personal step-by-step to get the backend, Docker services, and RDP claim working.

---

## Every-session startup (do this every time)

Run these in order in separate terminals:

### Terminal 1 — Docker (Redis + Guacamole)

```powershell
cd C:\PROJECTS\Workforce-Allocation-Platform\infrastructure
docker compose up -d
docker compose ps
```

You should see 4 containers running: `redis`, `guacd`, `guac_db`, `guacamole`.

### Terminal 2 — Backend

```powershell
cd C:\PROJECTS\Workforce-Allocation-Platform\backend
venv\Scripts\activate
uvicorn main:app --reload --port 8000
```

Backend is live at: `http://localhost:8000`
API docs: `http://localhost:8000/docs`

### Terminal 3 — Frontend

```powershell
cd C:\PROJECTS\Workforce-Allocation-Platform\frontend
npm run dev
```

Frontend is live at: `http://localhost:3000`

---

## One-time setup (already done? skip this)

### 1. Generate the Guacamole database init file

Only needed once ever. If `infrastructure/guacamole_initdb.sql` does not exist, run:

```powershell
cd C:\PROJECTS\Workforce-Allocation-Platform\infrastructure
docker run --rm guacamole/guacamole /opt/guacamole/bin/initdb.sh --postgresql | Out-File -Encoding utf8 guacamole_initdb.sql
```

Then start Docker as normal above.

### 2. Register your live RDP machine in Guacamole

Only needed once per machine. After Docker is running:

1. Open `http://localhost:8080/guacamole`
2. Login: `guacadmin` / `guacadmin`
3. Top-right → your username → **Settings** → **Connections** → **New Connection**
4. Fill in:
   - **Name:** anything (e.g. `Machine-KE-01`)
   - **Protocol:** `RDP`
   - **Hostname:** your Windows machine IP
   - **Port:** `3389`
   - **Username:** Windows login username
   - **Password:** Windows login password
5. Click **Save**
6. Click the connection you just saved — look at the URL:
   ```
   http://localhost:8080/guacamole/#/manage/connections/7
   ```
   The number at the end (`7`) is the **connection ID**. Copy it.

### 3. Link the RDP machine to the database

Open pgAdmin (or psql) and run:

```sql
UPDATE rdp_resources
SET guacamole_connection_id = '7'
WHERE nickname = 'Machine-KE-01';
```

Replace `7` with your actual connection ID.
Replace `Machine-KE-01` with the nickname in your platform's rdp_resources table.

To check what machines are in the DB:

```sql
SELECT id, nickname, status, guacamole_connection_id FROM rdp_resources;
```

---

## Test the RDP claim

1. Open `http://localhost:3000/worker/rdp-claim-board`
2. Find a machine with status `online_free`
3. Click **Claim**
4. A new browser tab should open with the Windows desktop in the browser

If no Guacamole tab opens: the machine's `guacamole_connection_id` is probably null — do step 3 above.

---

## Shutdown

```powershell
cd C:\PROJECTS\Workforce-Allocation-Platform\infrastructure
docker compose down
```

To also wipe Guacamole's database (full reset — you'll need to re-register connections):

```powershell
docker compose down -v
```

---

## Quick troubleshooting

| Problem | Fix |
|---------|-----|
| `docker compose ps` shows containers not starting | Run step 1 (generate `guacamole_initdb.sql`) first |
| Backend won't start — Redis connection error | Make sure Docker is up: `docker compose up -d` |
| Claim succeeds but no browser tab opens | `guacamole_connection_id` is null in DB — do step 3 |
| Guacamole tab opens but screen is blank | Windows firewall blocking port 3389 on the remote machine |
| `venv\Scripts\activate` not found | Run `python -m venv venv` first inside the backend folder |
