# How to Run the Backend + RDP
## GlobalSolutions — Step-by-Step Personal Guide

---

## What is Guacamole and do I need an account?

**No. You do not need to create any account anywhere.**

Guacamole is a free program that runs on your own computer inside Docker.
It lets workers connect to a Windows machine through the browser — no Remote Desktop app needed.

When Guacamole runs on your machine, it creates its own built-in admin login:
- Username: `guacadmin`
- Password: `guacadmin`

This is just for YOU to log into the Guacamole settings panel on your own computer.
It has nothing to do with any online account or subscription.

Your actual Windows RDP machine (the one workers will connect to) has its own
separate IP address, username, and password — you will enter those INSIDE Guacamole
when you register the connection. That is explained in detail in Part 3 below.

---

## PART 1 — First-time setup (do this once ever)

### Step 1 — Make sure Docker Desktop is open

1. Look at the taskbar at the bottom-right of your screen (the system tray)
2. Look for the Docker whale icon 🐋
3. If you see it, right-click it and make sure it says **"Docker Desktop is running"**
4. If you do not see it, press the Windows key, type `Docker Desktop`, and open it
5. Wait about 60 seconds until the whale icon stops animating

> Docker must be running before you do anything else. Everything runs inside Docker.

---

### Step 2 — Generate the Guacamole database file (one time only)

This creates a file that Guacamole needs to store its data.
You only ever do this once. If you already have a file called
`guacamole_initdb.sql` inside the `infrastructure` folder, skip this step.

1. Press `Windows + R`, type `powershell`, press Enter
2. Copy and paste this command and press Enter:

```powershell
cd C:\PROJECTS\Workforce-Allocation-Platform\infrastructure
docker run --rm guacamole/guacamole /opt/guacamole/bin/initdb.sh --postgresql | Out-File -Encoding utf8 guacamole_initdb.sql
```

3. Wait. Docker will download the Guacamole image if it has not done so before.
   This can take 2–5 minutes the first time.
4. When it finishes and you see the `>` prompt again, check the file was created:

```powershell
ls guacamole_initdb.sql
```

You should see the file listed. If yes — done, move to Step 3.

---

### Step 3 — Start Docker containers

This starts Redis (claim locking) + Guacamole (browser RDP). Run this every
time you want to develop, not just the first time.

1. In PowerShell, run:

```powershell
cd C:\PROJECTS\Workforce-Allocation-Platform\infrastructure
docker compose up -d
```

2. Wait about 30 seconds, then check everything is running:

```powershell
docker compose ps
```

You should see 4 rows, all showing `running` or `Up`:

```
NAME            STATUS
infrastructure-redis-1       Up
infrastructure-guacd-1       Up
infrastructure-guac_db-1     Up
infrastructure-guacamole-1   Up
```

If any show `Exit` or `Error` — the most common cause is that
`guacamole_initdb.sql` is missing. Go back to Step 2.

---

### Step 4 — Register your RDP machine inside Guacamole

This is where you enter the details of the actual Windows machine
that your workers will connect to (the IP address, username, password).

**You only do this once per machine.**

1. Open your browser and go to:
   ```
   http://localhost:8080/guacamole
   ```

2. You will see a Guacamole login page. Enter:
   - Username: `guacadmin`
   - Password: `guacadmin`
   - Click **Log In**

   > This is the local admin login. It is not an online account.
   > It only works on your own computer.

3. After logging in, click your username in the **top-right corner** of the page

4. A dropdown appears — click **Settings**

5. Click the **Connections** tab at the top

6. Click the **New Connection** button (top-right area of the connections panel)

7. Fill in the connection form:

   | Field | What to enter |
   |-------|--------------|
   | **Name** | A label for this machine, e.g. `Machine-KE-01` |
   | **Protocol** | Select `RDP` from the dropdown |
   | **Hostname** | The IP address of the Windows machine, e.g. `192.168.1.50` |
   | **Port** | `3389` (this is the standard RDP port — leave it as-is) |
   | **Username** | The Windows login username of the remote machine |
   | **Password** | The Windows login password of the remote machine |

   > The Hostname, Username, and Password here are the credentials of the
   > actual Windows computer — the same ones you would use if you opened
   > Remote Desktop Connection on your PC.

8. Scroll down and click **Save**

9. You will be taken back to the Connections list and you will see your
   new connection listed there

10. Click on the connection name you just created — look at the URL in your browser:

    ```
    http://localhost:8080/guacamole/#/manage/connections/7
    ```

    The **number at the end** of the URL (e.g. `7`) is the **Connection ID**.
    Write this number down — you need it in the next step.

---

### Step 5 — Link the connection ID to your database

Now you need to tell your platform which Guacamole connection belongs to
which machine in the database.

1. Open **pgAdmin** (press Windows key, type `pgAdmin`, open it)
2. Connect to your local PostgreSQL server
3. Expand: **Servers → PostgreSQL → Databases → workforceallocationdb**
4. Right-click `workforceallocationdb` → click **Query Tool**
5. First, see what machines are in your database:

```sql
SELECT id, nickname, status, guacamole_connection_id
FROM rdp_resources;
```

6. Find the nickname of the machine you just registered in Guacamole.
   Then run this to link the connection ID:

```sql
UPDATE rdp_resources
SET guacamole_connection_id = '7'
WHERE nickname = 'Machine-KE-01';
```

   Replace `7` with the connection ID from Step 4.
   Replace `Machine-KE-01` with the actual nickname from your database.

7. Click the **Run** button (or press F5). You should see `UPDATE 1` — that means it worked.

---

## PART 2 — Run the backend (every session)

Open a **new PowerShell window** (separate from the Docker one):

```powershell
cd C:\PROJECTS\Workforce-Allocation-Platform\backend
venv\Scripts\activate
uvicorn main:app --reload --port 8000
```

You should see output like:
```
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Started reloader process
```

Backend is running at: `http://localhost:8000`
You can browse all API endpoints at: `http://localhost:8000/docs`

> If you see `venv\Scripts\activate` not found — you have not set up the
> virtual environment yet. Run `python -m venv venv` first, then
> `pip install -r requirements.txt`.

---

## PART 3 — Run the frontend (every session)

Open another **new PowerShell window**:

```powershell
cd C:\PROJECTS\Workforce-Allocation-Platform\frontend
npm run dev
```

Frontend is running at: `http://localhost:3000`

---

## PART 4 — Test the RDP claim

1. Go to `http://localhost:3000/worker/rdp-claim-board`
2. Log in as a worker account
3. You should see your machine listed (e.g. `Machine-KE-01`)
4. If the status shows `online_free`, click **Claim**
5. A new browser tab should open automatically showing the Windows desktop

**That is the full RDP flow working.**

---

## Every-session checklist (quick reference)

```
1. Docker Desktop is open and running
2. PowerShell → cd infrastructure → docker compose up -d
3. PowerShell → cd backend → venv\Scripts\activate → uvicorn main:app --reload --port 8000
4. PowerShell → cd frontend → npm run dev
5. Open http://localhost:3000
```

---

## Troubleshooting

| Problem | What to do |
|---------|-----------|
| `docker compose ps` shows containers as `Exit` | Run Step 2 — `guacamole_initdb.sql` is probably missing |
| `http://localhost:8080/guacamole` shows nothing | Docker is not running — open Docker Desktop first |
| Backend error: `Connection refused` (Redis) | Docker containers are not running — `docker compose up -d` |
| Claim button works but no tab opens | `guacamole_connection_id` is null in the DB — do Step 5 |
| Guacamole tab opens but screen is black | Windows Firewall on the remote machine is blocking port 3389 |
| `venv\Scripts\activate` not found | Run `python -m venv venv` then `pip install -r requirements.txt` |
| Guacamole login fails with guacadmin/guacadmin | The guac_db container did not initialise — run `docker compose down -v` then repeat Step 2 and 3 |

---

## Shutdown

When you are done for the day:

```powershell
cd C:\PROJECTS\Workforce-Allocation-Platform\infrastructure
docker compose down
```

To fully reset Guacamole (wipes all registered connections — you will need to redo Step 4):

```powershell
docker compose down -v
```
