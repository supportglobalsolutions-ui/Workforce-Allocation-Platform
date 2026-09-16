# Phase 7 — control-plane + gateway redundancy

## Goal

Survive loss of one media gateway or one API host without dual-control of a
Windows session, and without inventing frees during Redis/Postgres outages.

This file is the operator runbook. Code support lives in:

- `backend/services/rdp_gateway_cluster.py` — sticky placement, drain, health
- `backend/services/rdp_coordinator.py` — Redis leader election + gateway probing
- `infrastructure/systemd/workforce-rdp-coordinator.service`
- `infrastructure/nginx/api-upstream.conf` — dual FastAPI upstream template
- `scripts/rdp_acceptance.py` — scores an acceptance run (Action 3)

---

## Action 1 — Gateway redundancy

### Configure multiple media nodes

In backend `.env`:

```ini
RDP_GATEWAY_CAPACITY=50
RDP_GATEWAYS=[{"id":"gw1","public_url":"https://guac1.yourdomain.com","private_url":"http://10.0.0.11:8080/guacamole","capacity":50},{"id":"gw2","public_url":"https://guac2.yourdomain.com","private_url":"http://10.0.0.12:8080/guacamole","capacity":50}]
GUACAMOLE_JSON_SECRET_KEY=<same 32 hex on every Guacamole node and the API>
```

Each media host runs `compose.media.yml` with its own guacd + guacamole +
guac_db (or a shared replicated guac_db — decide before scaling writes).

DNS: one A/AAAA per `guacN.` hostname (Cloudflare DNS-only, no proxy).

### Sticky placement

On claim / join-ticket the control plane stores `allocations.gateway_id`.
Reconnects reuse that gateway when it is still accepting seats. New claims
pick the least-loaded non-draining node under capacity.

### Maintenance drain

```bash
# Stop placing new sessions on gw1 (existing tunnels keep running)
curl -X POST -H "Authorization: Bearer $TOKEN" \
  https://api.yourdomain.com/rdp/gateways/gw1/drain

# Allow new placements again
curl -X POST -H "Authorization: Bearer $TOKEN" \
  https://api.yourdomain.com/rdp/gateways/gw1/undrain

# Inspect
curl -H "Authorization: Bearer $TOKEN" \
  https://api.yourdomain.com/rdp/gateways
```

Drain order: mark draining → wait for live_sessions → 0 (or force-stop) →
take host offline → undrain after healthy again.

A mistyped gateway id returns 404 rather than silently draining nothing.

### Losing a gateway without draining it first

Drain is the planned path. For an unplanned loss, the coordinator probes every
configured gateway once per tick (under leader election, so a claim never pays
for a probe) and publishes the result to `rdp:gateway:health:<id>`:

- A node observed **down** is skipped for new placements, and a reconnect whose
  sticky `gateway_id` points at it is re-placed onto a survivor.
- A node with **no marker** — never probed, marker expired, or no coordinator
  running — counts as usable. That is deliberate: a broken probe or a dead
  coordinator must degrade to blind placement, not empty the pool and refuse
  every claim (Principle 4, unknown is not free).
- `GET /rdp/gateways` reports `healthy` alongside `draining` and `live_sessions`.

Sessions already running on the lost node cannot be saved — their tunnels are
gone. They are released by the normal 5-minute grace, and the worker reclaims
onto a surviving gateway.

### Headroom

Three nodes that each pass a 50-session test are **not** 150 production seats.
Keep N+1 spare: run normally at ~2/3 of measured capacity so one node failure
still fits survivors.

---

## Action 2 — Control-plane redundancy

### Second FastAPI instance

1. Provision a second control host (or second process on a larger box).
2. Share the same `.env` secrets (Supabase, Redis, Guacamole JSON key).
3. Point both at the same Redis and Postgres (Supabase).
4. Put Nginx (or Hetzner LB) in front with the upstream in
   `infrastructure/nginx/api-upstream.conf`.
5. Set `RDP_RUN_COORDINATOR_IN_API=false` on **both** API hosts and run
   `workforce-rdp-coordinator` on exactly one host (or two with leader election —
   the Redis key already elects a single writer).

### Coordinator leader election

Already implemented: `rdp:coordinator:leader` Redis key with TTL.
Multiple coordinator processes may start; only the leader runs grace expiry
and reconcile ticks. If the leader dies, another instance takes over within
one TTL window.

### Postgres / Redis failover plan

| Store | Role | Failure response | Restore |
|---|---|---|---|
| Supabase Postgres | Authoritative ownership | Pause new claims/tickets; established media tunnels may continue | Supabase PITR / project failover; never invent frees |
| Redis | Locks, tickets, leader, drain flags | Pause ticket issuance and capacity locks; do not auto-release allocations | Redeploy Redis from empty; rebuild tickets on next claim; drain flags reset to env defaults |
| guac_db (per media host) | Guacamole connection catalog | That gateway goes offline; sticky sessions on it cannot reconnect until repaired | Restore from media-host backup; run reconcile |

Backups to keep now (even before a second node exists):

- Supabase automatic backups enabled
- Nightly `pg_dump` of each `guac_db`
- Document Redis as ephemeral — losing it must not erase Postgres allocations

---

## Action 3 — Full acceptance run

Targets (starting values — agree them **before** the run, not after seeing the
numbers). The machine-checked thresholds live in
`infrastructure/load-test/acceptance.example.json`; this table is the human
summary of the same intent:

| Metric | Starting target |
|---|---|
| Claim → first frame p95 | < 5 s |
| Reconnect p95 | < 10 s |
| Unexpected disconnects / session-hour | < 0.1 |
| Claims that succeed then never paint | 0 |

Runbook:

1. Cap measured from Phase 6 load test is applied (`RDP_MAX_LIVE_SESSIONS` / per-gateway).
2. Start N concurrent desktops for ≥ 12 hours with realistic typing/scrolling.
3. Inject: API deploy mid-session, kill one gateway (drain then stop), duplicate-tab Switch here, force-stop, Wi‑Fi style disconnect for 5 minutes, and kill the coordinator holding the leader key.
4. Capture first-frame, reconnect, drop rate, CPU/RAM on each gateway.
5. Feed plateaus into `scripts/rdp_capacity.py` with the Phase 6 limits JSON.
6. Fix failures; re-run until every gate passes.

### Scoring the run

"The acceptance suite passed" has to mean the same thing each time, so the
verdict is computed, not judged:

```bash
cp infrastructure/load-test/acceptance-results.example.json my-run.json
# replace every value with what was actually observed, then:
python scripts/rdp_acceptance.py my-run.json \
  --limits infrastructure/load-test/acceptance.example.json
```

Exit code 0 only when the endurance thresholds hold **and** all six required
scenarios are recorded as passed. Two rules matter most:

- A scenario that was not exercised scores `not run`, never a pass. Silence is
  not evidence, and every scenario must carry an `evidence` note.
- `api_deploy_mid_session` cannot pass on `media_path: "proxy"`. Pixels going
  through FastAPI cannot survive a restart of FastAPI, so a "pass" there would
  be measuring the wrong thing.

Record results under `docs/rdp-acceptance-results/` (create when you have numbers).

---

## Deploy order

1. Phase 5 direct gateway working on one media host.
2. Phase 6 split + measured cap.
3. Add second media host + `RDP_GATEWAYS` + DNS.
4. Dual API + coordinator unit + upstream.
5. Acceptance run before calling the platform “100-worker ready”.
