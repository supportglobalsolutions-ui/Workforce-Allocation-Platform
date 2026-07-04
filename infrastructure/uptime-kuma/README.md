# Uptime Kuma — RDP machine heartbeat monitoring

Uptime Kuma runs in Docker Compose and TCP-pings each RDP host on port **3389**. When a machine goes up or down, it notifies the FastAPI backend via webhook, which updates `rdp_resources.last_health_check_at` and the RDP status in PostgreSQL.

## Quick start

1. Start the stack (includes Uptime Kuma on port **3001**):

```powershell
cd infrastructure
docker compose up -d
```

2. Open **http://localhost:3001** and create the admin account (first visit only).

3. Set a webhook secret in `backend/.env`:

```env
UPTIME_KUMA_WEBHOOK_SECRET=choose-a-long-random-string
UPTIME_KUMA_URL=http://localhost:3001
```

4. In Uptime Kuma → **Settings → Notifications → Setup Notification**:
   - Type: **Webhook**
   - URL: `http://host.docker.internal:8000/integrations/uptime-kuma/webhook?token=YOUR_SECRET`
   - Method: **POST**
   - Apply on: **Down** and **Up**

   On Linux Docker, use your host IP instead of `host.docker.internal` if needed.

5. For each RDP machine in PostgreSQL, add a monitor in Uptime Kuma:
   - **Monitor Type:** TCP Port
   - **Friendly Name:** must match `rdp_resources.nickname` (e.g. `RDP-KE-001`)
   - **Hostname:** the RDP machine IP or hostname (`monitor_host` in the DB)
   - **Port:** `3389` (or `monitor_port` if different)
   - **Heartbeat Interval:** 60 seconds
   - **Notifications:** select the webhook above

## What the backend does

| Uptime Kuma event | PostgreSQL effect |
| :--- | :--- |
| TCP up | `last_health_check_at` updated; `offline`/`unhealthy` → `online_free` or `assigned` |
| TCP down | Status → `offline`; Firebase mirror + `system_alerts` entry |
| Maintenance | Status → `maintenance` |

Statuses `admin_locked` and `maintenance` (manual) are not overwritten except by explicit maintenance monitors.

## Verify integration

```http
GET /integrations/uptime-kuma/status
Authorization: Bearer <admin-firebase-token>
```

## Notes

- Monitor definitions live in the Uptime Kuma volume (`uptime_kuma_data`); nothing is committed to git.
- Session worker heartbeats (Redis) are separate from RDP TCP checks — see `POST /sessions/{id}/heartbeat`.
