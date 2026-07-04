# How to Run the Backend + RDP
## GlobalSolutions — Kelvin's Personal Guide

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
Windows username, and Windows password. You will type those directly into Guacamole
when you register the connection — that is covered in full below.

---

## FIRST TIME ONLY — Do these once, never again

---

### Make sure Docker Desktop is open

1. Look at the bottom-right corner of your screen (the system tray)
2. Find the Docker whale icon
3. Right-click it — it should say **Docker Desktop is running**
4. If you cannot find it, press the Windows key, type `Docker Desktop`, open it
5. Wait about 60 seconds until the icon stops animating

---

### Generate the Guacamole database file

Guacamole needs a database to store connections and users. This command creates it.
You only ever run this once. After this, the file stays on your machine forever.

1. Press `Windows + R`, type `powershell`, press Enter
2. Run this command:

```powershell
cd C:\PROJECTS\Workforce-Allocation-Platform\infrastructure
docker run --rm guacamole/guacamole /opt/guacamole/bin/initdb.sh --postgresql | Out-File -Encoding utf8 guacamole_initdb.sql
```

3. Docker will download the Guacamole image if it has not already — this can take 2–5 minutes
4. When the `>` prompt returns, check the file was created:

```powershell
ls guacamole_initdb.sql
```

You should see the file listed. If yes, continue.

---

### Start all Docker containers

```powershell
cd C:\PROJECTS\Workforce-Allocation-Platform\infrastructure
docker compose up -d
```

Wait 30 seconds then run:

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

Uptime Kuma UI: **http://localhost:3001** — see `infrastructure/uptime-kuma/README.md` for RDP TCP heartbeat setup and webhook configuration.

If any show `Exit` — the `guacamole_initdb.sql` file is probably missing or corrupted.
Run `docker compose down -v` and repeat the two commands above.

---

### Log into Guacamole and register your RDP machine

This is where you enter the details of the actual Windows machine workers will connect to.
You only do this once per machine.

1. Open your browser and go to:
   ```
   http://localhost:8080/guacamole
   ```

2. You will see a login screen. Enter:
   - Username: `guacadmin`
   - Password: `guacadmin`
   - Click **Log In**

3. After logging in, look at the **top-right corner** of the page — you will see `guacadmin`
   Click on it

4. A small dropdown appears. Click **Settings**

5. At the top of the Settings page, click the **Connections** tab

6. On the right side, click **New Connection**

7. A form appears. Fill in every field below exactly:

   **Name**
   Type a label for this machine. This is just so you can identify it.
   Example: `Machine-KE-01`

   **Protocol**
   Click the dropdown and select `RDP`

   **Maximum number of connections** — leave blank

   **Maximum number of connections per user** — leave blank

   Then scroll down to the section called **Parameters**

   **Hostname**
   Type the IP address of the Windows machine the workers will connect to.
   This is the IP of the actual remote Windows computer.
   Example: `192.168.1.50`

   **Port**
   Type `3389`
   This is the standard Windows RDP port. Always use 3389 unless someone told you otherwise.

   **Username**
   Type the Windows login username of the remote machine.
   This is the username used to log into Windows on that computer.
   Example: `Administrator` or whatever the Windows username is.

   **Password**
   Type the Windows login password of the remote machine.
   This is the password used to log into Windows on that computer.

   **Domain** — leave blank unless the machine is on a company Active Directory domain

   **Security mode** — leave as `Any`

   **Ignore server certificate** — tick this checkbox (this prevents SSL errors on self-signed certs)

8. Scroll to the bottom and click **Save**

9. You will be taken back to the Connections list. You should see `Machine-KE-01` listed.

10. Click on the name `Machine-KE-01` in the list.
    Look at the URL in your browser address bar. It will look like:
    ```
    http://localhost:8080/guacamole/#/manage/connections/7
    ```
    The **number at the very end** (in this example `7`) is the **Connection ID**.
    Write this number down. You need it in the next step.

---

### Link the connection ID to your platform database

Your platform's database needs to know that `Machine-KE-01` in the database
corresponds to connection ID `7` in Guacamole. This is what makes the Claim button
open the correct Windows desktop.

1. Open **pgAdmin** (press Windows key, type `pgAdmin`, open it)
2. In the left panel, expand: **Servers → PostgreSQL → Databases → workforceallocationdb**
3. Right-click `workforceallocationdb` → click **Query Tool**
4. First check what machines are in the database — paste and run this:

```sql
SELECT id, nickname, status, guacamole_connection_id
FROM rdp_resources;
```

5. You will see your machines listed. Find the `nickname` of the machine you just
   registered in Guacamole (e.g. `Machine-KE-01`).

6. Now paste and run this — replacing the values with your actual ones:

```sql
UPDATE rdp_resources
SET guacamole_connection_id = '7'
WHERE nickname = 'Machine-KE-01';
```

   Replace `7` with the connection ID you wrote down from the Guacamole URL.
   Replace `Machine-KE-01` with the nickname from your database.

7. Click the **Run** button (or press F5).
   You should see the message `UPDATE 1` at the bottom — that means it worked.

Also make sure the machine status is set to `online_free` so workers can claim it:

```sql
UPDATE rdp_resources
SET status = 'online_free'
WHERE nickname = 'Machine-KE-01';
```

---

## EVERY SESSION — Run this each time you develop

---

### Step 1 — Start Docker

Open PowerShell and run:

```powershell
cd C:\PROJECTS\Workforce-Allocation-Platform\infrastructure
docker compose up -d
```

Check containers are up:

```powershell
docker compose ps
```

All 4 should show `Up`: redis, guacd, guac_db, guacamole.

---

### Step 2 — Start the backend

Open a **new** PowerShell window and run:

```powershell
cd C:\PROJECTS\Workforce-Allocation-Platform\backend
venv\Scripts\activate
uvicorn main:app --reload --port 8000
```

You should see:
```
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
```

Leave this window open. The backend is now running at `http://localhost:8000`.

---

### Step 3 — Start the frontend

Open another **new** PowerShell window and run:

```powershell
cd C:\PROJECTS\Workforce-Allocation-Platform\frontend
npm run dev
```

Leave this window open. The frontend is now running at `http://localhost:3000`.

---

### Step 4 — Test the RDP claim

1. Open your browser and go to `http://localhost:3000`
2. Log in as a worker account
3. Go to the **RDP Claim Board** page
4. You should see your machine listed (e.g. `Machine-KE-01`) with status `online_free`
5. Click **Claim**
6. A new browser tab opens automatically showing the Windows desktop inside the browser

If a new tab does not open: the `guacamole_connection_id` in the database is null.
Go back to the **Link the connection ID** section above and run the SQL update.

---

## Shutdown

When done for the day:

```powershell
cd C:\PROJECTS\Workforce-Allocation-Platform\infrastructure
docker compose down
```

Full reset (wipes Guacamole database — you will need to re-register connections):

```powershell
docker compose down -v
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Containers show `Exit` after `docker compose up` | `guacamole_initdb.sql` is missing — run the generate command again |
| `http://localhost:8080/guacamole` shows nothing | Docker Desktop is not running — open it and wait 60 seconds |
| Backend crash: Redis connection refused | Run `docker compose up -d` first |
| Claim button works but no new tab opens | `guacamole_connection_id` is null — run the SQL UPDATE above |
| Guacamole tab opens but screen is black | Windows Firewall on the remote PC is blocking port 3389 |
| `venv\Scripts\activate` not found | Run `python -m venv venv` then `pip install -r requirements.txt` |
| Guacamole login fails with guacadmin/guacadmin | Run `docker compose down -v` then regenerate `guacamole_initdb.sql` and `docker compose up -d` |
