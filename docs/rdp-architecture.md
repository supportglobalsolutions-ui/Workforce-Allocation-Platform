# RDP Architecture
### GlobalSolutions Workforce Allocation Platform

This file has **two parts**:

| Part | Purpose | Keep? |
|---|---|---|
| **[Section 1 — Logic and design](#section-1--logic-and-design-keep-for-reference)** | How the system works, product rules, target design | **Keep** for future reference |
| **[Section 2 — Live testing](#section-2--live-testing)** | Pilot / VPS checks before `RDP_DIRECT_GATEWAY_MODE=on` | **Keep** until every Result is Success |

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

Still open if needed later: Windows host region/provider limits; capacity at claim vs connect if a positive cap is re-enabled; gateway fence timing. Degraded-mode runtime behaviour is **implemented** (Phase 8 Action 3); backup/restore plan remains in `docs/rdp-redundancy.md`.

**Non-goals:** rewrite FastAPI; replace Guacamole early; pixels through Vercel; migrate work to another Windows host on failure.

---

# Section 2 — Live testing

Build for Phases 1–8 is complete. This section is the remaining **live** proof on the VPS / browser before flipping `RDP_DIRECT_GATEWAY_MODE=on`.

**How to use**

| Column | Meaning |
|---|---|
| **Details** | What must be true |
| **Test to do** | Concrete steps (browser, DevTools, SSH) |
| **Result** | `Success` / `Fail` / `Not done` |

Update **Result** after each Action. Leave `Not done` until you run it.

---

## Test 2 — Direct join ticket

Prerequisite: `RDP_DIRECT_GATEWAY_MODE=pilot` and pilot email set on the VPS.

### Action 1 — Pilot claim and open

| Details | Test to do | Result |
|---|---|---|
| Pilot worker can claim and open a desktop on the direct path. | Log in as the pilot email. Claim an assigned machine and open the desktop session. | Not done |

### Action 2 — Join ticket returns direct mode

| Details | Test to do | Result |
|---|---|---|
| Join ticket API selects the Guacamole path, not the Python proxy. | In DevTools Network: `POST /rdp/{id}/join-ticket` response includes `"mode": "direct"`. | Not done |

### Action 3 — WebSocket goes to `guac.`

| Details | Test to do | Result |
|---|---|---|
| Desktop pixels use Guacamole WebSocket, not FastAPI `ws-tunnel`. | In DevTools: desktop WebSocket is `wss://guac.gsdeck.com/.../websocket-tunnel`, **not** `wss://api…/ws-tunnel`. | Not done |

---

## Test 3 — Ticket and public Guacamole security

### Action 1 — Ticket is single-use

| Details | Test to do | Result |
|---|---|---|
| A redeemed join ticket cannot be reused. | Capture `rdp_ticket` from the successful join. Replay the same ticket against Guacamole / verify → expect `403`. | Not done |

### Action 2 — Public Guacamole password login fails

| Details | Test to do | Result |
|---|---|---|
| Workers cannot log into Guacamole with a password on the public URL. | Open `https://guac.gsdeck.com` in a normal browser (no SSH tunnel). Confirm password login fails. (SSH-tunnel admin path may still work.) | Not done |

---

## Test 4 — API restart does not kill the desktop

### Action 1 — Restart backend mid-session

| Details | Test to do | Result |
|---|---|---|
| Live picture survives a control-plane restart (pixels on Guacamole). | With a live desktop open: `sudo systemctl restart workforce-backend`. Confirm the picture keeps moving and the tab does not go black. | Not done |

### Action 2 — Coordinator still healthy after restart

| Details | Test to do | Result |
|---|---|---|
| Coordinator unit stays up when API restarts. | After Action 1: `systemctl is-active workforce-rdp-coordinator` is `active`. Session still owned / not mass-released. | Not done |

---

## Test 5 — Shift watch and go-live

### Action 1 — Full-shift watch on direct path

| Details | Test to do | Result |
|---|---|---|
| Direct canvas stays usable for a real shift; legacy tunnel stays as rollback until then. | With `RDP_DIRECT_GATEWAY_MODE=pilot`, one or two real workers run a full shift. Confirm WebSocket stays on `wss://guac…/websocket-tunnel`. | Not done |

### Action 2 — Flip to `on`

| Details | Test to do | Result |
|---|---|---|
| After Tests 2–4 and Action 1 succeed, enable direct mode for everyone. | Set `RDP_DIRECT_GATEWAY_MODE=on` on the VPS, restart API + coordinator, record date/result. | Not done |

### Action 3 — Schedule legacy tunnel removal

| Details | Test to do | Result |
|---|---|---|
| Unused Python `ws-tunnel` path is removed in a later controlled release (not required to pass go-live). | After Action 2: note a release ticket/date to delete the legacy tunnel code path. | Not done |
