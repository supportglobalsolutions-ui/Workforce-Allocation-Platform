# RDP Architecture
### GlobalSolutions Workforce Allocation Platform

**Single source of truth for remote desktop:** design, single-VPS topology notes, and redundancy runbooks. Former `rdp-media-deployment.md` and `rdp-redundancy.md` content lives here.

| Part | Purpose |
|---|---|
| **[Section 1 — Logic and design](#section-1--logic-and-design-keep-for-reference)** | How the system works, product rules, target design |
| **[Section 3 — Single-VPS topology](#section-3--single-vps-topology-media-split-cancelled)** | Current ops plan; cancelled second-host / session-cap work |
| **[Section 4 — Redundancy](#section-4--control-plane--gateway-redundancy)** | Optional multi-gateway / dual-API runbook (future) |

---

# Section 1 — Logic and design (keep for reference)

## 1.1 Goal and product rules

**Goal:** link people to Windows machines easily, **one person per machine at a time**, with **reliable connect and disconnect** — no black screens, no buffering, no intermittent errors — even at large scale.

**How this product works (decided)**

- The same Windows machine can be used by **many workers**, but **never at the same time**.
- Ops can assign a machine to **one worker** or to **many** (a pool). **Assignment** = who *may* use it. **Lock (allocation)** = who *is* using it right now.
- We **do not shut down** Windows when someone leaves. We do **not** manage their apps or files.
- When they disconnect, Windows can stay as it is. We drop the **browser link** cleanly and free the lock for the next allowed person.
- **Browser disconnect grace: 5 minutes.** Tunnel drops → keep lock 5 minutes for reconnect → then **auto-release**. Detect from **browser ↔ Guacamole tunnel**, not Windows login.
- **End** (worker) and **admin force-stop** release **immediately**. Admins see **active sessions** and can force-stop.
- Priority is the **link**: claim → connect → disconnect.

**Already working today:** claim, Redis lock, one open allocation per machine, Guacamole provision, Uptime Kuma health, eight-state claim board.

**Already fixed in code:** wrong Guacamole id (black *Connecting…*), connection-id drift reconcile, encrypted RDP credentials, preflight retries on lossy links, friendly vs console errors, Nginx long WebSocket timeouts.

**Keep the stack:** Next.js, FastAPI, Guacamole, guacd, Redis. Do not rewrite the backend. Do not send desktop WebSockets through Vercel.

---

## 1.2 Principles

1. **Keep the products.** No swap to Kasm/RustDesk before this design is live.
2. **Two planes.** FastAPI = control (who may sit where). Guacamole/guacd = media (pixels). Pixels never pass through FastAPI or Vercel.
3. **5-minute grace, then release.** Wi‑Fi blip does not free instantly; after 5 minutes with no tunnel, free the lock. End / admin force-stop free immediately. Windows stays running.
4. **Unknown is not free immediately.** Brief blips do not free the machine. After grace with no tunnel, free it. Do not invent frees during Redis/Postgres outages.
5. **Confirm before reuse.** Machine available only after **our tunnel** is confirmed closed. No Windows logoff/cleanup gate.
6. **Workers never hold Guacamole admin credentials.**
7. **Measure, then size.** Capacity from load tests.
8. **Late actors must be harmless.** Every connect/kill/cleanup carries `allocation_id` + `connection_generation`; no-op if stale.
9. **We manage the link, not the desktop.**

---

## 1.3 How a browser RDP session works

### Two different sets of computers

Most confusion about this system comes from mixing these up:

| | What it is | Who sizes it |
|---|---|---|
| **The Windows machines** | The desktops workers actually work on — an "RDP resource" is one Windows host reachable on TCP **3389**. Each has a nickname (e.g. `RDP1`) and an IP. | **Not us.** They are supplied by the client/provider. We never manage their RAM, apps or files. |
| **Our server(s)** | The Hetzner VPS running *our* software: the API, Redis, Guacamole, guacd. | **Us.** Every RAM figure in §1.8 is about this. |

Workers never open `mstsc` (the Windows Remote Desktop app). The desktop arrives
in a browser tab.

### The parts, in plain terms

| Part | What it actually does | Runs where |
|---|---|---|
| **Browser** | Draws the desktop on an HTML5 canvas (`guacamole-common-js`) and sends keyboard/mouse back. | The worker's laptop |
| **FastAPI** (the API) | Decides **who may sit where** — claims, permissions, join tickets. Never touches pixels once Phase 5 is live. | Our server |
| **Coordinator** | The background timer that cleans up after things nobody clicked. See §1.6. | Our server |
| **Redis** | Short-lived shared memory: claim locks, join tickets, the coordinator's leader flag, drain flags. Losing it is survivable; see §1.9. | Our server |
| **Postgres (Supabase)** | The durable record of who owns what — workers, machines, allocations, sessions. | Hosted (Supabase) |
| **Guacamole** (Java/Tomcat) | Speaks the Guacamole protocol to the browser over **wss** (encrypted WebSocket), and holds the connection catalogue. | Our server |
| **guacd** | The workhorse: speaks RDP to the Windows machine, receives the screen and re-encodes it for the browser. | Our server |
| **Uptime Kuma** | Pings each Windows machine's port 3389 so we know if it is reachable. | Our server |

### Why our server's RAM is the ceiling

`guacd` does a live translation for **every connected worker** — RDP in, images
out — and that costs **30–50 MB of RAM each**, for as long as they stay
connected. Ten workers connected at once is 300–500 MB of guacd alone, on top
of everything else running.

That is why capacity is counted in **concurrent live desktops, not headcount**.
A hundred workers who never overlap need a small box; ten who all work 9–5 need
a bigger one.

**When the RAM runs out**, Linux kills its largest process — usually guacd — and
**every connected worker's screen goes black at the same moment**. That is the
"OOM / black screens" failure in §1.4, and the reason for the cap in §1.6.

### Who sees which machines

| Question | Meaning | Lives in |
|---|---|---|
| May I see it? | Visibility | Assignment |
| May I take it? | Eligibility | Assignment + machine status |
| Do I have it right now? | Lock | Allocation (one open per machine) |

- **Worker:** only machines assigned to them (solo or pool). Empty board explains “none assigned.”
- **Admin / Executive / Super Admin:** see all; may claim any free machine. Taking a held machine = deliberate **force-stop**, never silent takeover.
- One live allocation per machine always.

---

## 1.4 How it works today vs target

### Today (one Hetzner box)

| Piece | Where |
|---|---|
| UI | Vercel `www.gsdeck.com` |
| API | `api.gsdeck.com` → Nginx → FastAPI (Gunicorn) |
| Guacamole | `guac.gsdeck.com` → Nginx → Tomcat :8080 |
| Stack on same VPS | Redis, guacd, guacamole, guac_db, Uptime Kuma (~2 GB RAM — too small) |

**Canvas today:** browser → `wss://api…/rdp/{id}/ws-tunnel` → **Python copies every pixel** → Guacamole → guacd → Windows.  
`guac.` exists but workers do not use it for the canvas.

**Keep:** preflight → Redis `lock:rdp:{id}` → Allocation + WorkSession → connect when desktop tab opens.

### Why it fails under load (summary)

| Problem | Effect |
|---|---|
| Guacamole admin token to workers | Can read every Windows password |
| HTTP tunnel not scoped to claimed machine | Open another desktop with one claim |
| Sync work on async event loop | One slow connect freezes other desktops |
| Kill tunnel on every connect | Reconnect / second tab blacks the screen |
| Hang-up in background | Next claim hits busy Windows |
| Heartbeat on wrong tab + long idle steal | Machine stolen mid-shift (being replaced by 5‑min tunnel grace) |
| Python in the pixel path | Cannot scale video |
| 2 GB box | OOM / black screens |

### Target: control vs media

```
Browser → api.  → FastAPI (claim, ticket, auth)     [control]
Browser → guac. → Guacamole → guacd → Windows      [media / pixels]
```

FastAPI restart must **not** kill live desktops once pixels are on Guacamole.

**Stages of placement (same logic, different hardware):**

| Stage | Topology | Live desktops |
|---|---|---|
| **0 (live plan)** | One VPS, canvas on `guac.` with join ticket; **no numeric session cap** | What host RAM / Windows fleet allow |
| 1 | API box + separate Guacamole box | *Cancelled — not provisioning a second server* |
| 2 | Gateway cluster + redundant control | *Out of scope on single-VPS plan* |

---

## 1.5 State model and lock policy

### Three dimensions

| Dimension | Examples | Changed by |
|---|---|---|
| Machine health | reachable / unreachable | Uptime Kuma, probes |
| Allocation | reserved, assigned, ending, ended | Claim, end, admin, coordinator |
| Tunnel | connecting, connected, reconnecting, disconnected | Gateway / desktop path |

Health never silently frees ownership. After **5 minutes** with no tunnel → release allocation.

### Policy table

| Item | Behaviour |
|---|---|
| Tunnel up | Occupied; no 12‑hour auto-kick |
| Tunnel down | Reconnecting…; keep lock **5 minutes** (`RDP_DISCONNECT_GRACE_SECONDS=300`) |
| Still down after 5 min | Auto-release lock; Windows untouched |
| Worker End / admin force-stop | Release **immediately** after tunnel confirmed closed |
| End, but closure cannot be confirmed | Worker's allocation ends (never trapped, free to claim elsewhere); the **machine** is held in `maintenance` and stays out of the pool until closure is proven or an admin repairs it. Admin force-stop instead returns a retryable 503 |
| Reconnect within grace | Same lock; timer cancelled. The clock restarts from the reconnect, never from the original drop — on the proxy path by `prepare_connect`, on the direct gateway path by the join ticket, and as a backstop by the sweep noticing a live session under a counting-down machine |

### Concurrency

- At most one non-ended allocation per machine (DB unique index).
- Assignment ≠ lock.
- Late cleanup must carry generation and be a no-op if stale.

### Closing the link

1. Mark ending; block new joins for that generation.  
2. Kill our tunnel **synchronously**.  
3. Confirm zero tunnels.  
4. Mark ended / available.  

**No Windows logoff.** Next worker may see the previous Windows session — accepted.

**Disconnect UX:** button reacts immediately → optional evidence prompt while canvas still visible → close tab ~1s → server finishes confirmation.

**Evidence (product):** local screenshot helper (browser capture / crop) + optional remote-canvas capture; start/end reminders; never trap user in session; private storage.

---

## 1.6 Join ticket, tabs, capacity

**Join ticket (target):** FastAPI issues short-lived single-use ticket → browser opens `wss` on Guacamole → Guacamole auth (auth-json + Nginx `auth_request` recommended) → tunnel. No Guacamole admin token in the browser.

**Second tab:** not silent kill. Platform refuses or deliberate switch with generation bump **before** Windows ejects the first user.

**Capacity:** default **no numeric max-session cap** (`RDP_MAX_LIVE_SESSIONS=0` = unlimited). Optional positive cap + clear “at capacity” message remain in code if ops enables them later. Seat accounting still tracks occupied / held / grace for operators.

**Capacity during grace:** a machine in its 5-minute grace window **keeps its
capacity slot**. Its allocation is not released, so it is still counted. That
is deliberate: the slot is being held open *for* the returning worker, and
freeing it would let someone else take the seat the reconnect is coming back
to. Plan capacity knowing that a disconnect does not immediately give a seat
back.

**Held machines also keep their slot.** A machine out of service after an
unconfirmed close (§1.5) has an *ended* allocation, but the reason it is held is
that a tunnel may still be running on the gateway consuming the same RAM.
Counting that seat as free would admit a worker onto a box already at its
ceiling. Seat accounting is therefore open allocations **plus** held machines —
see `services/rdp_capacity.py` and `GET /rdp/capacity`.

---

### The coordinator — what it is and why it exists

It is **a background program of ours**, not a person and not a third-party
service.

**The problem it solves.** Almost everything in this system happens because
someone clicks: claim, connect, disconnect. But some things must happen when
**nobody clicks anything**. A worker's battery dies mid-session. Their Wi-Fi
drops and they never come back. The browser tab is closed while the API is
restarting. In every one of those cases nothing tells the server — and without
something checking on a timer, that machine stays locked to that worker
forever.

The coordinator is that timer. Every `RDP_LIFECYCLE_INTERVAL_SECONDS` (60 by
default) it wakes up and asks:

| Question | What it does about it |
|---|---|
| Any machine disconnected longer than the 5-minute grace? | Release it (§1.5) |
| Any allocation open whose gateway shows no session? | Start its grace clock (§1.9) |
| Any live gateway session nobody owns? | Report it — and reclaim it when enabled |
| Any disconnect stuck mid-close past 90s? | Hold the machine in quarantine (§1.5) |
| Are the gateways reachable? | Probe them, so placement can route around a dead one |
| Are Redis and Postgres reachable? | If not, **freeze every release** (§1.9) |

**Why it is its own process.** The API runs as several worker processes at
once (Gunicorn). If each ran this loop, four of them would race to release the
same machine, duplicating and contradicting each other's work. So every
instance tries to claim a **leader flag in Redis** and only the winner does the
work; the rest stand down until the leader disappears.

**Where it runs.** Either inside the API process (`RDP_RUN_COORDINATOR_IN_API=true`,
fine for a single box) or as its own systemd service,
`workforce-rdp-coordinator`, which is what production wants so an API deploy
never interrupts housekeeping.

**If it stops.** Nothing is released, ever. Live desktops keep working —
pixels do not pass through it — but disconnected machines stay locked to whoever
last held them, and the pool slowly drains to nothing. Check it with
`GET /rdp/coordinator`, which reports whether one is alive, which instance holds
the lease, and when it last ticked.

---

## 1.7 Errors (two audiences)

| Who | Sees |
|---|---|
| Worker | One calm sentence + Retry / Contact admin |
| Console + server log | Real cause, codes, request id (no secrets in browser) |

Examples: machine in use, not assigned, credentials rejected, reconnecting, timeout, offline, at capacity.  
Never endless *Connecting…*. Retry only transient failures.

---

## 1.8 Sizing (estimates)

**These numbers are about *our* server, not the Windows machines** (§1.3). The
Windows desktops are supplied by the client; we never size them.

### What is using the RAM

On our box, all at the same time:

| Piece | Roughly |
|---|---|
| Linux itself | ~300 MB |
| FastAPI / Gunicorn (the API) | ~300–500 MB |
| Guacamole (Java/Tomcat) | ~350 MB |
| `guac_db` (Guacamole's own Postgres) | ~150 MB |
| Redis | ~50 MB |
| Uptime Kuma | ~100 MB |
| **guacd — per connected worker** | **30–50 MB each** |

Everything above the last row is fixed cost, paid whether one worker is
connected or none. Only the last row grows, and it grows with **concurrent live
desktops**, not with how many workers you employ.

### What the server names mean

`CPX21` and friends are simply Hetzner Cloud's product names for machine sizes.
Nothing clever — more RAM means more simultaneous desktops.

| Name | vCPU | RAM | Realistic live desktops |
|---|---|---|---|
| Current box | 2 | ~2 GB | **5–8** — fixed costs eat most of it |
| CPX21 | 3 | 4 GB | ~15 |
| CPX31 | 4 | 8 GB | ~45 |
| CPX41 | 8 | 16 GB | ~100, or move to a cluster |

Check current specs and prices with Hetzner before buying; these change.

### Sizing on one VPS

**Current plan:** control and media stay on the **same** production VPS. Do not
provision a second host for Guacamole. Size RAM/CPU for the combined load
(API + Redis + coordinator + Kuma + Guacamole + guacd + guac_db). Desktop count
drives guacd memory — scale the box (or the Windows fleet) when host pressure
shows up; we are **not** enforcing a fixed `RDP_MAX_LIVE_SESSIONS` ceiling.

A control/media split remains documented in-repo only as a future option — it is
not part of the live topology.

CPU and network bandwidth matter more than disk here — encoding screens is
processor and bandwidth work, not storage.

### When you run out

Linux kills its largest process, usually guacd, and **every connected worker
goes black at the same instant**. There is no graceful degradation. Ops policy
is **no numeric max-session cap** (`RDP_MAX_LIVE_SESSIONS=0` = unlimited).
Watch host RAM/CPU and grow the VPS (or shrink concurrent Windows usage) rather
than rejecting claims at an arbitrary number. A positive
`RDP_MAX_LIVE_SESSIONS` remains available in code if ops later chooses a hard
ceiling.

---

## 1.9 Failure behaviour

| Failure | Response |
|---|---|
| Wi‑Fi drop | Reconnecting…; 5‑min grace |
| Offline > 5 min | Auto-release lock |
| End / admin force-stop | Immediate release |
| API deploy (after media split) | Live tunnels continue |
| Capacity full | Clear message |
| Tunnel dies unobserved | Sweep sees no gateway session; after two confirmations the machine goes to `idle` and the normal 5‑min grace runs |
| Live session with no allocation | Sweep reports it; kills it when `RDP_SWEEP_KILL_ORPHANS=true` |
| Closure unconfirmed > 90 s | Allocation → `quarantined`, machine held out of service, admin Repair. Never released on an unproven close |
| Gateway unreachable | Skipped for new placements; its machines are treated as **unknown**, not sessionless — no release clock starts |
| Media node restart | Viewers reconnect with jittered backoff; gateway admits `RDP_GATEWAY_ADMIT_PER_SECOND` new connects per second and asks the rest to wait |

### Degraded mode — Redis or Postgres unreachable

Ownership lives in Postgres; locks, tickets, the coordinator lease and drain
flags live in Redis. With either gone we cannot **prove** who owns what, so
everything that would take a machine away from someone is frozen. Nothing that
merely observes is.

| Operation | While degraded |
|---|---|
| Grace expiry / auto-release | **Frozen** |
| Sweep Direction A (start a grace clock) | **Frozen** — the sweep still runs and reports, it just does not act |
| Orphan kills, quarantine escalation, capacity repair | **Frozen** |
| Gateway health probes, reads, logging | Continue |
| Live desktops | **Unaffected** — pixels do not pass through the control plane |
| New claims / join tickets | Refused with a calm, retryable message, never a 500 |

**Recovery.** A 30‑minute outage leaves every `idle` machine far past its
5‑minute grace, so the first healthy tick would release the whole fleet at once
— with every one of those workers still sitting at a desktop. After health
returns, releases stay suppressed for `RDP_DEGRADED_RECOVERY_SECONDS=300` to
give reconnects a fair window. If we cannot even tell whether we are still
recovering, the answer is "yes": hold the machine.

Visible at `GET /rdp/health/degraded` rather than inferred from machines
quietly not being freed.

---

## 1.10 Open decisions (not blocking day-to-day)

Answered: scale toward large concurrency; 5‑min grace; disconnect only (no Windows logoff); force-stop required; no silent dual tabs; **Guacamole auth-json** over a custom extension (Phase 5); **no numeric max-session cap** (`RDP_MAX_LIVE_SESSIONS=0`); load-test scripts remain optional tooling only; grace-window sessions hold their capacity slot when a cap is enabled (§1.6).

Still open if needed later: Windows host region/provider limits; capacity at claim vs connect if a positive cap is re-enabled; gateway fence timing. Degraded-mode runtime behaviour is **implemented** (Phase 8 Action 3); backup/restore plan is in [§4](#section-4--control-plane--gateway-redundancy).

**Non-goals:** rewrite FastAPI; replace Guacamole early; pixels through Vercel; migrate work to another Windows host on failure.

---

# Section 3 — Single-VPS topology (media split cancelled)

Status: **single-VPS topology only** — a separate media host will not be provisioned.
**Session cap:** we do **not** enforce a numeric max-session limit
(`RDP_MAX_LIVE_SESSIONS=0` = unlimited). Do not size or apply a production
ceiling from a ramp.
The coordinator (Phase 4) and direct ticket-authenticated browser gateway (Phase 5)
are live on this same host. Compose media/control split files remain in-repo for a
possible future split; they are not part of the current ops plan.

> **Cancelled:** provisioning `workforce-rdp-prod` / moving Guacamole to a second VPS
> (§3.1–3.3 below). Skip those sections unless the single-VPS decision is reversed.
>
> **Cancelled:** measured load ramp to set `RDP_MAX_LIVE_SESSIONS` (§3.4). Scripts and
> CSV templates remain for optional diagnostics only.

## 3.1 Provision and network

*(Reference only — cancelled for live ops.)*

Create `workforce-rdp-prod` in the control host's region, with an operator-selected
size and SSH key. Attach both hosts to the same private network/subnet. Example
addresses below are **placeholders**: control `10.20.0.2`, media `10.20.0.3`.
Record server ID, region, vCPU, RAM, NIC speed, public/private addresses and image
versions with the acceptance results. No capacity is implied by the chosen size.

Install Docker Compose v2, Nginx and Certbot using [deployment.md](deployment.md). Allow public
80/443, restrict SSH to operations IPs, and allow private TCP 8081 only from the
control host. Permit media egress to each Windows host on its configured RDP port;
update Windows/provider allowlists for the new media egress IP. Kuma and API
preflight probes still need control-host access to Windows.

The media Compose file publishes only localhost 8080; PostgreSQL and guacd have no
published ports. Nginx binds private 8081 and enforces a control-IP allowlist.
Private HTTP assumes a trusted network; use an encrypted overlay or private TLS
if your threat model requires encryption between hosts. Docker-published ports
are still reachable from other containers on the same host unless firewall rules
block them — treat published ports as host-local, not internet-private.

## 3.2 DNS, TLS, Compose split

*(Reference only — cancelled for live ops.)*

## 3.3 Data migration and cutover

*(Reference only — cancelled for live ops.)*

Do not combine this move with a Guacamole or PostgreSQL major-version upgrade.

## 3.4 Capacity measurement (optional diagnostics only)

**Not part of the live plan.** Ops does not set a max-session number from this
section. If you still want host-pressure numbers for resizing the VPS (not for
`RDP_MAX_LIVE_SESSIONS`), the ramp protocol and `scripts/rdp_capacity.py` remain
available; leave production at `RDP_MAX_LIVE_SESSIONS=0`.

| Acceptance item | Result |
|---|---|
| Provisioned media host and migrated data | **Cancelled** — single-VPS only; Guacamole stays on the existing host |
| Direct gateway + API restart acceptance | Passed locally (2026-09-19); production go-live when `RDP_DIRECT_GATEWAY_MODE=on` |
| Measured ramp → set `RDP_MAX_LIVE_SESSIONS` | **Cancelled** — unlimited (`0`); no numeric session ceiling |
| Production cap from evidence | **N/A** — policy is no fixed max sessions |

---

# Section 4 — Control-plane + gateway redundancy

Optional future runbook. Live ops stay on **one** VPS ([§3](#section-3--single-vps-topology-media-split-cancelled)). Code support already exists for multi-gateway when needed.

## Goal

Survive loss of one media gateway or one API host without dual-control of a
Windows session, and without inventing frees during Redis/Postgres outages.

Code support lives in:

- `backend/services/rdp_gateway_cluster.py` — sticky placement, drain, health
- `backend/services/rdp_coordinator.py` — Redis leader election + gateway probing
- `infrastructure/systemd/workforce-rdp-coordinator.service`
- `infrastructure/nginx/api-upstream.conf` — dual FastAPI upstream template
- `scripts/rdp_acceptance.py` — scores an acceptance run (§4.3)

---

## 4.1 Gateway redundancy

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

## 4.2 Control-plane redundancy

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

## 4.3 Full acceptance run

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

1. Cap measured from optional load diagnostics is applied (`RDP_MAX_LIVE_SESSIONS` / per-gateway) only if ops re-enables a numeric ceiling.
2. Start N concurrent desktops for ≥ 12 hours with realistic typing/scrolling.
3. Inject: API deploy mid-session, kill one gateway (drain then stop), duplicate-tab Switch here, force-stop, Wi‑Fi style disconnect for 5 minutes, and kill the coordinator holding the leader key.
4. Capture first-frame, reconnect, drop rate, CPU/RAM on each gateway.
5. Feed plateaus into `scripts/rdp_capacity.py` with the limits JSON.
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

## 4.4 Deploy order (if multi-host is revived)

1. Phase 5 direct gateway working on one media host.
2. Optional media split + measured diagnostics (§3).
3. Add second media host + `RDP_GATEWAYS` + DNS.
4. Dual API + coordinator unit + upstream.
5. Acceptance run (§4.3) before calling the platform “100-worker ready”.
