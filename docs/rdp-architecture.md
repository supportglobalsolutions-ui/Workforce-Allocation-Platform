# RDP Architecture
### GlobalSolutions Workforce Allocation Platform

This file has **two parts**:

| Part | Purpose | Keep? |
|---|---|---|
| **[Section 1 — Logic and design](#section-1--logic-and-design-keep-for-reference)** | How the system works, product rules, target design | **Keep** for future reference |
| **[Section 2 — Implementation](#section-2--implementation-delete-when-done)** | Phases and actions to build it; progress % | **Delete** when everything is at 100% |

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
| 0 | One VPS, canvas on `guac.` with join ticket | What RAM allows (≥ 4 GB) |
| 1 | API box + separate Guacamole box | ~15–50 |
| 2 | Gateway cluster + redundant control | 100+ with spare |

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

**Capacity:** `RDP_MAX_LIVE_SESSIONS` / per-gateway caps; atomic reservation; clear “at capacity” message; headroom for reconnects.

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

### Splitting the work

Once the media plane moves to its own host (Phase 6), the two sides size
separately:

- **Control** (API + Redis + coordinator + Kuma) ≈ **~1.2 GB** — a CPX21 is
  plenty, and it does not grow with desktop count.
- **Media** (Guacamole + guacd + guac_db) is the side that scales with live
  desktops, and the side worth spending on.

CPU and network bandwidth matter more than disk here — encoding screens is
processor and bandwidth work, not storage.

### When you run out

Linux kills its largest process, usually guacd, and **every connected worker
goes black at the same instant**. There is no graceful degradation. That is why
`RDP_MAX_LIVE_SESSIONS` exists, why the current default is a conservative **6**,
and why the cap must be raised from a measured load test (§1.2, Principle 7)
rather than by feel.

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

Answered: scale toward large concurrency; 5‑min grace; disconnect only (no Windows logoff); force-stop required; no silent dual tabs; **Guacamole auth-json** over a custom extension (Phase 5); **load-test pass thresholds** are set — `infrastructure/load-test/limits.example.json` (capacity) and `acceptance.example.json` (acceptance), enforced pass/fail by `scripts/rdp_capacity.py` and `scripts/rdp_acceptance.py`; grace-window sessions hold their capacity slot (§1.6).

Still open if needed later: Windows host region/provider limits; upgrade 2 GB now vs cap; capacity at claim vs connect; gateway fence timing; **what the control plane does *while* Redis/Postgres are unreachable** (the backup and restore plan is in `docs/rdp-redundancy.md`; the runtime degraded-mode behaviour is Phase 8 Action 3).

**Non-goals:** rewrite FastAPI; replace Guacamole early; pixels through Vercel; migrate work to another Windows host on failure.

---

# Section 2 — Implementation (delete when done)

Progress starts at **0%**. Update the **%** column as work ships until each phase is **100%**, then delete this whole section.

**How to use each action table**

| Column | Meaning |
|---|---|
| **Details of what is supposed to be done** | Requirement from Section 1 |
| **What we will do** | Concrete build steps (points) |
| **%** | Progress for this action (0 → 100) |

**Pending table** (separate, under every action — no `%` column):

| Column | Meaning |
|---|---|
| **Details of what is supposed to be done** | What is still left for this action |
| **What we will do** | Concrete steps you will do later (e.g. on the VPS) |

Leave the Pending table blank when nothing is waiting. Fill it when code is done but ops/deploy/verify remains (or any unfinished slice).

**What `%` measures:** the build. `100%` means *everything buildable is built and tested locally* — there is no code left to write for that action. It does **not** mean "proven in production".

A `100%` action may therefore still carry Pending rows, and those rows may only ever contain **live verification** — running it against a real gateway, a real deploy, real hardware. If a Pending row describes something that could be written or fixed locally, the action is **not** 100%. Clear the Pending rows once the live verification passes.

**Phase order:** finish Phase 1 before relying on later phases. Phase 1 and Phase 2 can run in parallel.

---

## Phase 1 — Safety

**Goal:** stop workers reading Windows passwords or opening machines they did not claim.

**Done when:** a real worker account cannot get a Guacamole admin token, cannot read connection parameters, and cannot open an unclaimed desktop.

### Action 1 — Stop handing Guacamole admin token to workers

| Details of what is supposed to be done | What we will do | % |
|---|---|---|
| Workers must never receive `guacadmin` (or equivalent) tokens. `GET /rdp/{id}/tunnel-info` must not expose admin auth. Connection URLs must not embed admin tokens. | - Audit `tunnel-info` and remove or restrict to admin-only<br>- Remove token fields from worker responses<br>- Stop embedding admin tokens in `get_connection_url` / proxied paths<br>- Rotate `guacadmin` password after deploy | **95%** |

**Pending**

| Details of what is supposed to be done | What we will do |
|---|---|
| Rotate Guacamole admin password after deploy (assume any old token leaked). Production refuses empty/`guacadmin` at startup until this is done. | - Change `guacadmin` password in the Guacamole UI on the VPS<br>- Set matching `GUACAMOLE_PASSWORD` in backend `.env`<br>- Keep `GUACAMOLE_URL=http://127.0.0.1:8080/guacamole`<br>- `sudo systemctl restart workforce-backend` |

### Action 2 — Scope tunnel access to the claimed machine only

| Details of what is supposed to be done | What we will do | % |
|---|---|---|
| A worker with one open claim must not open another machine’s desktop via `/rdp/tunnel` or WebSocket. | - Require open allocation for **that** `rdp_id`<br>- Reject otherwise with friendly “not your machine” / not found<br>- Cover HTTP tunnel and `ws-tunnel` auth checks | **100%** |

**Pending**

| Details of what is supposed to be done | What we will do |
|---|---|
| | |

### Action 3 — Lock down `/remote/*` and public Guacamole admin APIs

| Details of what is supposed to be done | What we will do | % |
|---|---|---|
| Browser must not use Vercel `/remote/*` as a path to Guacamole REST that can dump credentials. Public `guac.` must not expose `/api/session/data/*` broadly. | - Remove or heavily restrict Next.js `/remote` rewrite in production<br>- Nginx on `guac.`: block public session-data APIs except auth integration needs<br>- Verify with worker session in browser network tab | **90%** |

**Pending**

| Details of what is supposed to be done | What we will do |
|---|---|
| Apply Guacamole public API lockdown on the live VPS and confirm a worker cannot reach session-data / `/remote` credential paths. | - Paste blocks from `infrastructure/nginx/guacamole-hardening.conf` into live `workforce-platform.conf` (`guac.` server, before `location /`)<br>- `sudo nginx -t && sudo systemctl reload nginx`<br>- Redeploy frontend so production has no `/remote` rewrite<br>- As a worker: DevTools Network — `/remote/*` and `guac.…/api/session/data/…/connections` must fail; no Guacamole token in API responses |

---

## Phase 2 — Errors and worker journey

**Goal:** every failure is clear on screen; claim board and disconnect feel finished.

**Done when:** no silent black *Connecting…*; every mapped failure has a friendly message; workers only see assigned machines.

### Action 1 — Error contract on every RDP path

| Details of what is supposed to be done | What we will do | % |
|---|---|---|
| Worker sees one calm sentence; console gets real cause + request id; never swallow connect/disconnect errors. | - Wire claim, connect, disconnect, force-release through `reportError` / `RdpOutcome` — **done** (claim board, session page, viewer, admin RDP page)<br>- Map busy 517, 516, 769, offline 514/515, capacity, 401, 403, not-assigned, no-open-claim — **done, 9/9 verified**<br>- Connecting deadline + final state — **done** (viewer timer)<br>- After several failures, offer Contact admin — **done** (claim board + `RdpViewer` after 3 connect failures → `/worker/chat`)<br>- `RdpOutcome` on the backend — **done** (Phase 4 Action 3, `rdp_engine.py`) | **100%** |

**Pending**

| Details of what is supposed to be done | What we will do |
|---|---|
| | |

### Action 2 — Assigned-only claim board (workers)

| Details of what is supposed to be done | What we will do | % |
|---|---|---|
| Workers see only assigned machines; empty state explains why; server enforces visibility. | - Backend filter lists/details/claim/preflight/join-ticket by assignment — **done** (`list_visible_rdp_resources` / `require_worker_visible_or_staff`)<br>- Empty copy: no desktops assigned — **done**<br>- Admin/executive/super admin see all — **done**<br>- UUID guessing returns non-disclosing not-found — **done**<br>- Standing solo assignment restored after release — **done** (`restore_assignment` on claim) | **100%** |

**Pending**

| Details of what is supposed to be done | What we will do |
|---|---|
| | |

### Action 3 — Fast disconnect UX

| Details of what is supposed to be done | What we will do | % |
|---|---|---|
| Red Disconnect reacts instantly; tab closes ~1s; server confirms tunnel closed before lock free. | - Immediate Disconnecting UI — **done** (desktop tab)<br>- Evidence prompt while canvas still visible — **done**<br>- Idempotent end API; navigate after confirm — **done** (await `end-connection`, then ~0.9s to session history)<br>- Confirm closure before `online_free` — **done** (`rdp_engine.disconnect` → `close_and_confirm`) | **100%** |

**Pending**

| Details of what is supposed to be done | What we will do |
|---|---|
| | |

### Action 4 — Screenshot / evidence in desktop toolbar

| Details of what is supposed to be done | What we will do | % |
|---|---|---|
| Capture start/end evidence without Snipping Tool; missing evidence is a reminder, not a trap. | - Local screen capture path (`getDisplayMedia`) + crop — **done** (`captureDisplayFrame`)<br>- Optional remote-canvas capture (`Display.flatten`) — **done** (`RdpViewer.captureRemoteFrame`)<br>- Reuse `session-images` upload pipeline — **done** (`uploadSessionImageBlob`)<br>- Prompt on disconnect; allow end anyway — **done** | **100%** |

**Pending**

| Details of what is supposed to be done | What we will do |
|---|---|
| | |

---

## Phase 3 — Stop dropping sessions

**Goal:** reconnects do not black-screen; grace works; admins can force-stop; box does not freeze everyone.

**Done when:** Wi‑Fi blip keeps lock briefly; after 5 minutes lock frees; End/force-stop immediate; one slow connect does not freeze others.

### Action 1 — Stop killing tunnel on every connect

| Details of what is supposed to be done | What we will do | % |
|---|---|---|
| Reconnect / second tab must not unconditionally `kill_active_connections`. | - Remove kill-on-connect — **done**<br>- Refuse second connection before it hits Windows — **done**<br>- Deliberate takeover only (generation bump) — **done** (Phase 4 Action 4: `connection_generation` + explicit Switch here)<br>- Verified with two real browser tabs — **done** | **100%** |

**Pending**

| Details of what is supposed to be done | What we will do |
|---|---|
| | |

### Action 2 — 5-minute disconnect grace + desktop-path liveness

| Details of what is supposed to be done | What we will do | % |
|---|---|---|
| Tunnel down → 5 min grace → auto-release. Detect from desktop tunnel, not claim-board heartbeat steal. | - Add `RDP_DISCONNECT_GRACE_SECONDS=300` — **done**<br>- Watch completed desktop WebSocket tunnel — **done**<br>- Replace old 10m/20m claim-tab idle steal — **done**<br>- Reconnect within grace keeps same allocation — **done**, and now genuinely on **both** paths. The proxy path always cancelled the clock in `prepare_connect`; the Phase 5 direct path never did, because the browser reconnects straight to Guacamole and nothing in the control plane witnessed it. A blip followed by a reconnect would therefore be released ~5 min after the *original* drop, mid-session. Fixed two ways: the join-ticket path cancels the clock immediately when it finds its machine `idle`, and the sweep gained **Direction C** (live gateway session while counting down → back to `active`) as the backstop for reconnects we never see<br>- Gateway-side observations — **done** (Phase 8 Action 1: the sweep asks each gateway directly, so grace no longer depends on our own process having witnessed the close)<br>- Intra-tick reconnect guard — **done** (`still_releasable`). The release loop worked from a snapshot of expired candidates; a reconnect landing between that query and the release flips the machine back to `active` **without** bumping `connection_generation`, so `disconnect()`'s staleness check could not see it and a live tunnel would be killed. Every release now re-reads the row first and skips if the machine returned or its clock restarted; an unreadable row is never released (Principle 4). Counted as `skipped_reconnected` in the tick stats<br>- Sweep ordering — **done**: Direction C runs before grace expiry in the same tick, so a resurrected session is never a release candidate<br>- Decision-logic tests — **done** (23 tests across `test_grace_liveness.py`, `test_grace_resume_wiring.py`, `test_release_guard.py`: release predicate incl. exact boundary, reconnect-resets-clock regression, intra-tick reconnect and clock-restart, re-read actually happens, unreadable row held, naive-timestamp comparison, every non-idle state, missing timestamp, resume needs the owning gateway to have answered, quarantined left alone, stale generation cannot start a clock, plus wiring guards that fail if any fix is dropped in a refactor) | **100%** |

**Pending**

| Details of what is supposed to be done | What we will do |
|---|---|
| Live verification only — nothing buildable is left. None of this has run against a real gateway, and it cannot be until the Phase 5 pilot is up. | - Close a laptop mid-session while restarting the API: the sweep should start grace for a tunnel nobody watched die<br>- Drop Wi-Fi ~2 minutes, reconnect, and confirm the machine is **not** released at the 5-minute mark (the direct-path bug fixed here)<br>- Reconnect deliberately while a coordinator tick is mid-release and confirm `skipped_reconnected` increments instead of the tunnel dying<br>- Watch one full shift: `grace_cancelled` should be non-zero on lossy links and zero on clean ones |

### Action 3 — Sync hang-up before next claim

| Details of what is supposed to be done | What we will do | % |
|---|---|---|
| End/force-release must not return success while tunnel still live. | - Await kill + confirm zero active tunnels — **done**<br>- Explicit outcomes: closed / already_closed / pending / failed — **done**, now tested against all four (`tests/test_closure_confirmation.py`, gateway REST stubbed)<br>- Never reuse a machine on an unproven close — **done**, by splitting two requirements that were in direct tension. Blocking a worker's End trapped them with a Live claim; releasing it put a possibly-live machine back in the pool (violating Principle 5). The allocation now **ends** (the worker is free to claim elsewhere immediately) while the **machine** is held in `maintenance` with the reason stamped on the allocation. Nobody is trapped; nobody inherits a live tunnel. Admin force-stop still returns a retryable 503, because an admin needs to know<br>- Held machines are visible and repairable — **done** (`GET /rdp/quarantined` returns both `quarantined` and `held`; `POST /rdp/{id}/repair` re-confirms closure on the machine's own gateway and **refuses to return it to service** unless the tunnel is proven gone — `still_unconfirmed` otherwise)<br>- Dedicated quarantine state — **done** (Phase 8 Action 2), and the migration is now **applied** — live DB is at `8f1c04a97b62`<br>- Escalation clock fixed — **done**. `escalate_stuck_endings` measured from `resource.status_changed_at`, which for a live session is hours old, so an unconfirmed closure was quarantined on the *first* tick instead of after 90s — defeating the window that lets a transient gateway failure resolve itself. The disconnect path now stamps `last_gateway_observation_at` on the **transition** into `ending` (transition-only, so repeated Disconnect presses cannot hold a genuinely stuck closure out of quarantine forever), and escalation measures from that<br>- Timing extracted to a testable seam — **done** (`classify_ending` → escalate / wait / needs_stamp; a row with no clock is stamped, never quarantined on absent evidence)<br>- Tests — **done** (24: all four closure outcomes with the gateway stubbed, encoded-id matching, unrelated sessions untouched, admin 503 contract, worker frees-but-holds, hold-is-not-a-release, repair-confirms-before-freeing, escalation boundary, naive timestamps, transition-only stamp, admin visibility of both states) | **100%** |

**Pending**

| Details of what is supposed to be done | What we will do |
|---|---|
| Live verification only — nothing buildable is left. | - Block the API→Guacamole route mid-disconnect; confirm the allocation sits in `ending` for ~90s and *then* quarantines (not on the first tick), then Repair it<br>- End a session with Guacamole stopped: confirm the worker leaves cleanly and can immediately claim another desktop, while the machine shows under `held` and is **not** claimable<br>- Restart Guacamole and Repair the held machine: confirm it only returns to service once closure is actually proven, and reports `still_unconfirmed` while it is not |

### Action 4 — Unblock async tunnel (no freeze)

| Details of what is supposed to be done | What we will do | % |
|---|---|---|
| Sync DB/Guacamole calls must not block the event loop while relaying pixels. | - Move blocking setup/token/repair work to `asyncio.to_thread` — **done**<br>- Include self-heal `get_connection` / `sync_connection` — **done** | **100%** |

**Pending**

| Details of what is supposed to be done | What we will do |
|---|---|
| | |

### Action 5 — Capacity cap + admin active sessions

| Details of what is supposed to be done | What we will do | % |
|---|---|---|
| Cap live sessions on small box; admins see and force-stop sessions. | - `RDP_MAX_LIVE_SESSIONS=6` default — **done**<br>- Atomic claim-time cap and clear at-capacity message — **done**<br>- Existing active sessions UI + force-stop waits for closure — **done** (`frontend/app/admin/rdp/page.tsx`)<br>- Seat accounting corrected — **done** (`services/rdp_capacity.py`). The cap counted open allocations, but a machine **held** after an unconfirmed close (Action 3) has an *ended* allocation while a tunnel may still be running on the gateway. That seat was reported free, so a 6-seat box could be admitted past its real ceiling and OOM — the exact failure the cap exists to prevent. `occupied_seats()` now counts open allocations (grace included, §1.6) **plus** held machines, de-duplicated. A machine an admin put into maintenance by hand carries no quarantine stamp and is correctly *not* counted<br>- Operator visibility — **done** (`GET /rdp/capacity`: cap, occupied, available, in-grace, held ids). A cap cannot be sized from a load test if it cannot be observed during one<br>- Tests — **done** (18: grace holds its seat, held machine holds its seat, hold-cleared frees it, manual maintenance excluded, no double-counting, cap boundary, cap of 0 is not "unlimited", snapshot breakdown, never-negative availability, plus guards that claim uses seat accounting and the endpoint stays admin-only) | **100%** |

**Pending**

| Details of what is supposed to be done | What we will do |
|---|---|
| Hardware and measurement only — nothing buildable is left. The box is still ~2 GB, and `6` is a conservative guess rather than a measured figure. | - Resize the VPS to ≥ 4 GB before operating above the conservative cap<br>- Take the measured ceiling from Phase 6 Action 2 (`scripts/rdp_capacity.py` against a real ramp) and set `RDP_MAX_LIVE_SESSIONS` from it — do not raise it by feel<br>- Watch `GET /rdp/capacity` during the ramp: `occupied` should track the real desktop count, and `held_machines` should stay at 0 on a healthy run<br>- **Ops note:** a held machine holds its seat until repaired, so forgotten holds shrink usable capacity. That is the deliberate trade-off (refuse rather than overcommit); `held_machine_ids` names them so they can be cleared |

---

## Phase 4 — Ownership model and coordinator

**Goal:** stale kills cannot wreck new sessions; one authority for lifecycle.

**Done when:** generation-safe takeover; coordinator owns grace/closure; late actors are no-ops.

### Action 1 — State fields and generations

| Details of what is supposed to be done | What we will do | % |
|---|---|---|
| Separate health / allocation / tunnel; `connection_generation`; versioned updates. | **Local / code — complete (nothing left to build under this action):**<br>- Alembic migration `f6a7b8c9d0e1` — **done** (enums + columns + partial unique index)<br>- Models/enums (`Allocation.connection_generation` / lifecycle / tunnel; `RDPResource.machine_health` / `version`) — **done**<br>- Generation-aware updates + stale no-ops — **done** (`generation_matches` in `rdp_engine.py`; covered by `tests/test_generation_safety.py`)<br>- DB lock expression `uq_allocations_active_rdp` (`WHERE released_at IS NULL`) — **done** in migration + model `__table_args__`<br>- Empty `rdp_state_machine.py` — **n/a** (already absent; `rdp_state.py` remains)<br>- Local/dev DB — **confirmed** (index + columns present; alembic at head past `f6a7b8c9d0e1`) | **90%** |

**Pending**

| Details of what is supposed to be done | What we will do |
|---|---|
| VPS / production only — no further local code. Apply the ownership migration on the live database and confirm the partial unique index exists. Do this later on the VPS (or prod Supabase). Until then keep this action at 90%. | - On the VPS: `cd backend && alembic upgrade head` (and `alembic current` — must include `f6a7b8c9d0e1` or a later head)<br>- Verify: `\d+ allocations`, `\d+ rdp_resources`<br>- Verify index: `SELECT indexname, indexdef FROM pg_indexes WHERE indexname = 'uq_allocations_active_rdp';` — must be unique on `rdp_resource_id` with `WHERE (released_at IS NULL)` |

### Action 2 — Session coordinator process

| Details of what is supposed to be done | What we will do | % |
|---|---|---|
| Lifecycle not duplicated inside every Gunicorn worker. | - systemd coordinator service — **done** (`infrastructure/systemd/workforce-rdp-coordinator.service`)<br>- Reconcile `activeConnections` / Guacamole connections — **done** (coordinator tick)<br>- Expire grace, confirm closures, repair capacity slots — **done** (generation-aware)<br>- Redis leader election so only one tick runs — **done**<br>- **Clean shutdown fixed** — `systemctl stop` sends SIGTERM, and Python's default disposition exits without running `finally`, so `release_leadership()` never fired on the one path that matters most: a deploy. The lease was left to expire (≥120s of nobody expiring grace). `main()` now runs under a SIGTERM/SIGINT handler that cancels the loop so the `finally` runs, with a Windows fallback for local dev. Unit hardened to match (`KillSignal=SIGTERM`, `TimeoutStopSec=20s`, `StartLimitIntervalSec=0` so a crash loop never leaves the fleet permanently un-reconciled)<br>- **Made verifiable** — `GET /rdp/coordinator` reports which instance last ticked, whether it holds the lease, how long ago, whether it is overdue, and whether it is running *inside an API process* (the misconfiguration this action exists to remove). Heartbeat is written on healthy **and** degraded ticks, so "alive but holding releases" is distinguishable from "dead"<br>- Tests — **done** (16: signal handling, cancel-releases-the-lease exercised for real, entrypoint wiring, Windows fallback, heartbeat freshness/staleness/leader identity, degraded heartbeat, unreadable Redis is *unknown* not dead, heartbeat failure never breaks its own tick) | **100%** |

**Pending**

| Details of what is supposed to be done | What we will do |
|---|---|
| Ops only — nothing buildable is left. The standalone unit has never run under systemd. | - Install the unit, set `RDP_RUN_COORDINATOR_IN_API=false` in backend `.env`, `systemctl enable --now workforce-rdp-coordinator`, restart `workforce-backend`<br>- Verify with `GET /rdp/coordinator`: `alive: true`, `is_leader: true`, `running_inside_api: false`, `last_tick_seconds_ago` under one interval<br>- `systemctl restart workforce-rdp-coordinator` and confirm the lease is handed over in seconds, not after the TTL — that is the SIGTERM fix working on real systemd<br>- Run two coordinators briefly and confirm only one ticks |

### Action 3 — Extract `rdp_engine.py`

| Details of what is supposed to be done | What we will do | % |
|---|---|---|
| Claim/connect/disconnect/force_release sequence in one place; thin routers. | - Add `services/rdp_engine.py` — **done**<br>- Move claim → disconnect → connect → force_release — **done**<br>- Return `RdpOutcome` (ok, code, friendly, detail) — **done**<br>- Shrink `routers/rdp.py` under ~400 lines — **done** (~396): helpers in `services/rdp_support.py`; Guacamole HTTP/WS + desktop-guard/preflight/tunnel-info in `routers/rdp_tunnel.py`; capacity/quarantine/gateways in `routers/rdp_ops.py`; admin update/provision/lock in `routers/rdp_admin.py`; main router keeps claim/end/list/create wiring and `include_router`s | **100%** |

**Pending**

| Details of what is supposed to be done | What we will do |
|---|---|
| | |

### Action 4 — Duplicate-tab behaviour

| Details of what is supposed to be done | What we will do | % |
|---|---|---|
| Two tabs must not fight into a black screen. | - Detect already open — **done** (409 / close 4409)<br>- Message / Switch here with generation takeover — **done** (viewer + `takeover=1`)<br>- Close old tunnel before new connect — **done** (`close_and_confirm` then connect)<br>- Verified end-to-end with two real browser tabs — **done** (Switch here, End closes sibling tab, no black fight) | **100%** |

**Pending**

| Details of what is supposed to be done | What we will do |
|---|---|
| | |

---

## Phase 5 — Pixels on Guacamole (leave Python)

**Goal:** live picture on `guac.`, join ticket from FastAPI.

**Done when:** live desktop survives API deploy; FastAPI CPU no longer scales with live desktops.

### Action 1 — Join ticket API

| Details of what is supposed to be done | What we will do | % |
|---|---|---|
| After claim, FastAPI issues short-lived single-use ticket bound to worker + allocation + machine + generation. | - `POST /rdp/{id}/join-ticket` — **done** (`routers/rdp.py`, `services/rdp_gateway.py`)<br>- Redis nonce ~30s — **done** (`services/rdp_join_ticket.py`; SHA-256 at rest, single-use via `GETDEL`)<br>- Bound to worker + allocation + machine + connection + generation — **done** (uses Phase 4's `allocation.connection_generation`)<br>- **Also bound to the gateway** — **done**. The ticket named a connection but not *which media node* it was for, so in a Phase 7 cluster a ticket minted for `gw1` could be redeemed at `gw2`. The session would then run on a node the control plane is not tracking: `allocation.gateway_id` points elsewhere, so `client_for_allocation` queries the wrong node on force-stop, finds nothing, and releases the machine with a live tunnel on it. Each gateway's Nginx now names itself via `X-Gateway-Id` and a mismatch is refused (`wrong_gateway`). Absent header = single-gateway deployment, deliberately not treated as a mismatch so existing configs keep working<br>- Invalidate on end/force-stop — **done** (revoked in `rdp_engine.disconnect`, and redemption re-reads the DB so a released allocation refuses anyway)<br>- Nginx-facing `GET /rdp/gateway/verify-ticket` — **done**<br>- **Rate limit keyed per worker** — **done**. It was keyed on IP alone, so an office or VPN behind one address shared a single 120/hour budget. Phase 8 Action 4 made that acute: one flaky connect now spends up to **6** tickets (jittered retries) plus a silent refresh every few minutes, so ~10 workers on one IP would trip the limit during a gateway blip — exactly when they are trying to reconnect, and on the direct path that means silently falling back to the Python proxy<br>- Tests — **done** (12 binding/limit tests on top of the 8 redemption ones: every claim survives the round trip, legacy tickets without a gateway still parse, mismatch refused before acceptance, absent header tolerated, the Nginx template actually sends the header, and the limit is resolved per worker before it is applied) | **100%** |

**Pending**

| Details of what is supposed to be done | What we will do |
|---|---|
| Live verification only — nothing buildable is left. Redemption is unit-tested (issue → redeem → replay refused → revoke → wrong gateway) but has never been spent against a live Guacamole, because that needs Action 2 deployed. | - After Action 2 is applied, claim a desktop and confirm `POST /api/tokens?rdp_ticket=…` returns 200 once and 403 on replay<br>- Confirm force-stop mid-session makes an in-flight ticket fail<br>- With two gateways live, present a `gw1` ticket to `gw2` and confirm `wrong_gateway`<br>- Watch real reconnect rates for a shift and confirm 120/worker/hour is comfortable — it should be, at ~8 refreshes/hour plus retries, but the number is still an estimate |

### Action 2 — Guacamole auth integration

| Details of what is supposed to be done | What we will do | % |
|---|---|---|
| Guacamole accepts ticket without giving workers admin login. | **Local implementation complete:**<br>- Auth-json Compose configuration explicitly enables the extension and requires a non-default shared key<br>- Nginx `auth_request` ticket gate, CORS allowlist, private control-plane upstream, and gateway identity header are ready (`infrastructure/nginx/guacamole-join-ticket.conf`)<br>- Scope token to one connection (`services/guacamole_json_auth.py`; blob carries exactly one connection, round-trip decrypt verified against the extension's wire format)<br>- Workers never hold a Guacamole login (blob is AES-encrypted with a key only Guacamole and FastAPI share)<br>- Production validation rejects an invalid direct-gateway URL, key, or rollout mode | **90%** |

**Pending**

| Details of what is supposed to be done | What we will do |
|---|---|
| VPS deployment and live acceptance only — no further local implementation is waiting. | - Generate one random 32-hex shared key and set it in backend and Compose env files; do not use a fallback<br>- Set real browser origins in `$guac_cors_origin`; on a separate media VPS, point `workforce_control_api` to the API VPS private address<br>- Apply Nginx, recreate Guacamole, inspect its startup log, and run a pilot with `RDP_DIRECT_GATEWAY_MODE=pilot`<br>- Verify direct `wss://guac…/websocket-tunnel`, one-time ticket replay rejection, no public Guacamole admin login, and API-restart survival; only then change to `on` and record the result |

### Action 3 — Point RdpViewer at `guac.`

| Details of what is supposed to be done | What we will do | % |
|---|---|---|
| Canvas uses `NEXT_PUBLIC_GUACAMOLE_URL` / wss to Guacamole, not Python `ws-tunnel`. | **Local implementation complete:**<br>- `RdpViewer.tsx` uses direct `wss` to Guacamole when a ticket is issued, with the legacy tunnel retained as a pilot rollback path<br>- *Deviation:* gateway origin comes from backend `GUACAMOLE_PUBLIC_URL`, returned in the join ticket, so API, CORS, and the shared key use one source of truth<br>- Silent auth refresh does not remount the viewer<br>- Pilot controls are implemented (`RDP_DIRECT_GATEWAY_MODE=off\|pilot\|on` + `RDP_DIRECT_GATEWAY_PILOT_EMAILS`)<br>- Deployment runbook is complete<br>- Legacy tunnel removal is a post-pilot release cleanup, not a prerequisite to deploy the direct path | **90%** |

**Pending**

| Details of what is supposed to be done | What we will do |
|---|---|
| VPS deployment and live acceptance only — direct canvas has not yet drawn a real desktop. The legacy tunnel remains as the planned rollback path until the production pilot proves the direct path. | - Set `RDP_DIRECT_GATEWAY_MODE=pilot` with one or two real workers and watch a full shift<br>- Confirm the desktop WebSocket is `wss://guac…/websocket-tunnel`, not `wss://api…/ws-tunnel`<br>- Restart the backend mid-session and confirm the picture keeps moving<br>- Set `RDP_DIRECT_GATEWAY_MODE=on` after acceptance; schedule removal of the now-unused legacy tunnel in the next controlled release |

---

## Phase 6 — Split media host and measure

**Goal:** Guacamole on its own VPS; capacity from tests.

**Done when:** measured targets hold at intended concurrency.

### Action 1 — Move Guacamole stack to media VPS

| Details of what is supposed to be done | What we will do | % |
|---|---|---|
| Control = API + Redis + Kuma + coordinator. Media = guacamole + guacd + guac_db. | - Separate control/media Compose files — done<br>- Private Nginx access and public gateway template — done<br>- Migration, DNS/TLS and rollback runbook — done<br>- Provision and deploy `workforce-rdp-prod` — pending | **40%** |

**Pending**

| Details of what is supposed to be done | What we will do |
|---|---|
| Provision and verify the media host; target topology is not live. | - Follow `docs/rdp-media-deployment.md`: create VPS/private network, restore Guacamole DB, configure firewall and Windows allowlists, DNS/TLS, switch private backend URL, smoke-test and retain rollback<br>- Finish Phase 4 coordinator and Phase 5 direct gateway before accepting API-restart survival |

### Action 2 — Load test and set caps

| Details of what is supposed to be done | What we will do | % |
|---|---|---|
| Set `RDP_MAX_LIVE_SESSIONS` from measurement, not guesses. | **Local / code — complete (nothing left to build under this action):**<br>- Operator-run ramp protocol — **done** (`docs/rdp-media-deployment.md` §4; browser automation optional, not required)<br>- Measurement schema + limits templates — **done** (`infrastructure/load-test/measurements.example.csv`, `limits.example.json`)<br>- Capacity evaluator (latency / failure / soak / CPU / memory / reserve) — **done** (`scripts/rdp_capacity.py` + tests); report recommends settings and **never** edits production `.env`<br>- Live seat accounting + `GET /rdp/capacity` + cap+1 rejection — **done** (Phase 3 Action 5 + tests)<br>- Default production cap stays **6** until measured evidence exists — **intentional** | **90%** |

**Pending**

| Details of what is supposed to be done | What we will do |
|---|---|
| Live measurement and production application only — no further local code. Do this later on real media + test workers/desktops. Until then keep this action at 90% and leave `RDP_MAX_LIVE_SESSIONS=6`. | - Agree intended concurrency and copy/agree `limits.example.json` thresholds **before** the run<br>- Prepare one authorized test worker + one distinct Windows desktop per simultaneous seat (non-production cohort)<br>- Run the documented browser ramp; capture first-frame / reconnect / drop timings and host CPU/memory; fill `measurements.csv`<br>- `python scripts/rdp_capacity.py <csv> --limits <limits.json> > capacity-report.json` (exit 0)<br>- Verify direct-media path + API restart survival, then admission at cap and clear rejection at cap+1<br>- Apply `recommended_settings.RDP_MAX_LIVE_SESSIONS` to API and coordinator `.env`, restart, and record date/hardware/results in `docs/rdp-media-deployment.md` |

---

## Phase 7 — Redundancy and full acceptance

**Goal:** survive gateway loss; prove long-run reliability.

**Done when:** acceptance suite passes, including long session run.

### Action 1 — Gateway redundancy

| Details of what is supposed to be done | What we will do | % |
|---|---|---|
| More than one media path with spare capacity and draining. | **Local / code — complete (nothing left to build under this action):**<br>- Extra guacd/gateway nodes — **config + runbook done** (`RDP_GATEWAYS`, `infrastructure/compose.media.yml`, `docs/rdp-redundancy.md`)<br>- Control plane talks to each node — **done** (`GuacamoleClient(base_url=…)` + per-gateway token cache; disconnect / connect / tunnel-liveness use `client_for_allocation`)<br>- Sticky placement by allocation — **done** (`allocations.gateway_id`, `rdp_gateway_cluster.py`)<br>- Maintenance drain — **done** (`GET /rdp/gateways`, `POST …/drain|undrain`; strict id → 404)<br>- Unplanned gateway loss — **done** (coordinator probes each tick; skips unhealthy; sticky reconnect re-place; unprobed nodes stay usable)<br>- Unit coverage — **done** (`tests/test_gateway_cluster.py`, `tests/test_direct_gateway_config.py`) | **80%** |

**Pending**

| Details of what is supposed to be done | What we will do |
|---|---|
| Live multi-host provision only — no further local code. Only ever exercised against a fake cluster in unit checks; no second media host exists yet. Do this later on real Guacamole. Until then keep this action at 80%. | - Deploy second `compose.media.yml` host on the private network<br>- Set the same `GUACAMOLE_JSON_SECRET_KEY` on every node<br>- Fill `RDP_GATEWAYS` JSON in backend `.env` and restart API (+ coordinator)<br>- Smoke: claim lands on least-loaded gw; drain gw1 → new claims skip it while live tunnels keep running; reconnects stay sticky<br>- Kill gw2 outright → coordinator marks it down within one tick; new claims route to gw1 |

### Action 2 — Control-plane redundancy

| Details of what is supposed to be done | What we will do | % |
|---|---|---|
| API/coordinator survive single-node failure for new claims/tickets. | **Local / code — complete (nothing left to build under this action):**<br>- Second FastAPI instance — **Nginx upstream template done** (`infrastructure/nginx/api-upstream.conf`)<br>- Coordinator leader election — **done** (Phase 4 Redis leader key; `tests/test_coordinator_leadership.py`)<br>- Fast, safe handover — **done** (`release_leadership` on clean shutdown; only the holder may release; unit covered)<br>- Standalone coordinator unit — **done** (`infrastructure/systemd/workforce-rdp-coordinator.service`; `RDP_RUN_COORDINATOR_IN_API=false` for production)<br>- Postgres/Redis backup/failover plan — **done** (`docs/rdp-redundancy.md`) | **70%** |

**Pending**

| Details of what is supposed to be done | What we will do |
|---|---|
| Live second host + rehearsal only — no further local code. Today: one API host, one coordinator. The failover plan is written but has never been rehearsed, and Supabase backups/PITR are not confirmed on. Until then keep this action at 70%. | - Provision second API host sharing Redis + Supabase secrets<br>- Enable `workforce_api` upstream; set `RDP_RUN_COORDINATOR_IN_API=false`; run the coordinator unit on both hosts<br>- Kill one API → claims/tickets still serve; kill the coordinator leader → standby takes over on the next tick<br>- Verify Supabase automatic backups/PITR are enabled; take one nightly `pg_dump` of each `guac_db` |

### Action 3 — Full acceptance run

| Details of what is supposed to be done | What we will do | % |
|---|---|---|
| Prove connect/disconnect under load and failure. | **Local / code — complete (nothing left to build under this action):**<br>- Single scored evaluator — **done** (`scripts/rdp_acceptance.py` + 7 unit tests; configurable limits, per-scenario evidence required, a not-run scenario can never score as a pass, and "survived an API deploy" is refused on the proxy media path because that would be measuring the wrong thing)<br>- Duplicate softer checklist scorer — **deleted** (`scripts/rdp_acceptance_checklist.py` removed; one verdict path only)<br>- Templates — **done** (`infrastructure/load-test/acceptance.example.json`, `acceptance-results.example.json`)<br>- Runbook — **done** (`docs/rdp-redundancy.md`, incl. scoring section)<br>- Multi-hour concurrent run + failure injections — **not started** | **35%** |

**Pending**

| Details of what is supposed to be done | What we will do |
|---|---|
| The live soak itself only — no further local code. Zero real measurements exist; the only thing the evaluator has scored is its own example template. Blocked until Phases 5–6 media/load work and Actions 1–2 hosts are live. Until then keep this action at 35%. | - Agree the targets in `acceptance.example.json` **before** the run, not after seeing the numbers<br>- Soak ≥ 12 h at measured concurrency<br>- Inject gateway kill, API deploy mid-session, Switch here, force-stop, 5-minute grace, coordinator-leader kill<br>- Record observations + evidence into `docs/rdp-acceptance-results/*.json`<br>- Pass `python scripts/rdp_acceptance.py <results> --limits infrastructure/load-test/acceptance.example.json` (exit 0) |

---

## Phase 8 — Close the silent-failure gaps

**Goal:** no state the system cannot see, name, or exit from.

**Done when:** every open allocation and every live gateway session is accounted for by a sweep; nothing can sit in a transitional state forever; datastore outages have a written behaviour the code actually follows; and the generation races are proven by tests instead of by reading the code.

**Where this came from:** a design review of §1. Four of its findings were already implemented (coordinator leader election, persisted grace timestamps, grace capacity accounting, load-test thresholds) and are recorded as answered in §1.6 / §1.10. The five below are real and unbuilt.

**Order:** Actions 1–3 change link behaviour and should land **before** the Phase 5 pilot — they are what stops a machine being lost silently, and debugging them in production is far more expensive. Actions 4–5 are better sized from real numbers, so they belong **after** the Phase 6 measurement.

### Action 1 — Bidirectional session sweep

| Details of what is supposed to be done | What we will do | % |
|---|---|---|
| Nothing compares open allocations against live gateway sessions. `reconcile_rdp_connections` only repairs connection *definitions* (catalogue drift after a fresh Guacamole), never sessions. That leaves two blind spots, both of which lose a machine silently: **(a)** allocation open, tunnel dead, no process watching (worker closes the laptop during an API restart) — the machine stays `active` forever, because the coordinator only inspects resources already marked `idle`; **(b)** a live gateway session with no open allocation (crash between guacd connect and the DB write) — invisible to the state model, holding RAM and a Windows session nobody owns. | **Local / code — complete (nothing left to build under this action):**<br>- `services/rdp_session_sweep.py`, run once per coordinator tick — **done**<br>- Live picture per gateway via `list_active_connections()` on every node — **done** (iterates `parse_gateways()`, not just the default)<br>- **Direction A** — sessionless allocation → `idle` + `status_changed_at`, handing it to the existing 5-minute grace rather than releasing it — **done**<br>- **Direction B** — live session with no open allocation → killed on its own gateway, audited as `rdp.orphan_killed` — **done**, behind `RDP_SWEEP_KILL_ORPHANS` (default off; on the proxy path a session can legitimately exist for a moment before its allocation row commits)<br>- Generation carried and re-checked immediately before the write, so a reconnect that raced the sweep wins — **done**<br>- **Two consecutive observations** before acting — **done** (`RDP_SWEEP_CONFIRMATIONS=2`, Redis miss counter cleared whenever a session is seen; an unrecordable miss counts as zero)<br>- Unreachable gateway is unknown, not empty — **done** (`_gateway_was_read`: a machine is only judged when the node that would hold it answered; rows with no sticky `gateway_id` need *every* node to answer)<br>- Counters in tick stats + logs — **done** (`SweepStats`)<br>- Unit coverage — **done** (`tests/test_session_sweep.py`: miss counting, streak clearing, gateway-silence, reporting) | **100%** |

**Pending**

| Details of what is supposed to be done | What we will do |
|---|---|
| Live verification only — no further local code. Decision logic is unit-tested but the pass has never run against a real Guacamole, so Direction B has never actually seen an orphan. Keep `RDP_SWEEP_KILL_ORPHANS=false` until the Phase 5 direct path is live. | - After the Phase 5 pilot, watch the sweep's log lines for a full shift with killing still disabled and confirm it reports zero false orphans<br>- Then set `RDP_SWEEP_KILL_ORPHANS=true` and confirm a deliberately orphaned session (kill the API mid-connect) is reclaimed<br>- Confirm Direction A starts grace for a laptop closed during an API restart — the case that motivated this action |

### Action 2 — Quarantine state and `ending` escalation

| Details of what is supposed to be done | What we will do | % |
|---|---|---|
| “Unknown is not free” currently has no exit. When `close_and_confirm` returns `pending`/`failed` the API answers 503 and the allocation stays `ending` — correct caution, but with no cap, no escalation and no admin surface, so a control↔media partition can strand a machine indefinitely. `quarantine` has been promised since Phase 3 Action 3 and appears nowhere in the codebase. | **Local / code — complete (nothing left to build under this action):**<br>- Alembic migration `b8c9d0e1f2a3` — **done** (`quarantined` enum + `quarantined_at` / `quarantine_reason`; applied on shared Supabase)<br>- `RDP_ENDING_ESCALATE_SECONDS=90` escalation in the coordinator tick — **done** (`escalate_stuck_endings`)<br>- Held, not released: machine goes to `maintenance`, so it is not claimable and not counted free, and nobody inherits a live tunnel — **done**<br>- `GET /rdp/quarantined` + `POST /rdp/{id}/repair` — **done**<br>- Audit on entry (`rdp.quarantined`) and exit (`rdp.quarantine_repaired`) — **done**<br>- Admin Held / quarantined list with **Repair** on the RDP management screen — **done** (`frontend/app/admin/rdp/page.tsx`; shows `quarantine_reason`)<br>- Worker copy — **done** (“This desktop is being checked by an admin” on claim board, claim/connect/join-ticket APIs, and viewer error map) | **100%** |

**Pending**

| Details of what is supposed to be done | What we will do |
|---|---|
| Live rehearsal only — no further local code. | - Block the API→Guacamole route mid-disconnect, confirm escalation after 90s, then Repair<br>- Confirm the worker sees the checked-by-admin sentence on the claim board and in the viewer |

### Action 3 — Degraded-mode behaviour for Redis / Postgres

| Details of what is supposed to be done | What we will do | % |
|---|---|---|
| Principle 4 says “do not invent frees during Redis/Postgres outages”, but there is no procedure — only an accident. Losing Redis makes `try_become_leader` raise, which aborts the whole coordinator tick, so grace expiry, the sweep and gateway probes all stop with a stack trace and no signal. Fail-safe by luck is not a design, and the recovery edge is worse: after a 30-minute outage every `idle` machine is instantly past its 5-minute grace and would be released in one batch. | - Policy written into §1.9 as a table, per store — **done**<br>- `services/rdp_degraded.py` with `datastore_health()` / `releases_allowed()` — **done**<br>- Coordinator freezes every **releasing** action while degraded and logs one structured `DEGRADED` line per tick instead of a traceback — **done**. The sweep still runs in `allow_mutations=False` mode, so the blind spots stay visible without anything being taken away<br>- **Recovery grace** — **done** (`RDP_DEGRADED_RECOVERY_SECONDS=300`; the marker lives in Redis, not memory, so a coordinator failover mid-outage does not reset the clock)<br>- When we cannot even tell whether we are recovering, the answer is “yes” — hold the machine — **done**<br>- `GET /rdp/health/degraded` (admin) — **done**<br>- Claims and join tickets now translate Redis/Postgres failures to `503`, `Retry-After: 5`, and a worker-safe “try again shortly” message; the global rate limiter follows the same retryable contract — **done**<br>- Unit-tested: Redis loss, Postgres loss, recovery window, no-false-recovery, unreadable-Redis, status payload, claim/join-ticket retry contract, and app routing — **done** (28 focused tests) | **90%** |

**Pending**

| Details of what is supposed to be done | What we will do |
|---|---|
| Local implementation is complete. The remaining work is live outage acceptance on the VPS; only a real datastore interruption can prove tunnels remain usable and releases stay frozen through recovery. | - Stop Redis with desktops live: confirm existing tunnels keep drawing, no machine is released, and `GET /rdp/health/degraded` reports the failure<br>- Restart Redis and confirm the 300-second recovery window prevents a mass release<br>- Repeat the same interruption and recovery checks for Postgres; record the evidence in the acceptance results |

### Action 4 — Reconnect storm control

| Details of what is supposed to be done | What we will do | % |
|---|---|---|
| A media node restart drops every tunnel on it at once and every viewer retries immediately — a thundering herd against guacd and Nginx at the moment they are most fragile. `RdpViewer` has no reconnect backoff, and the per-worker join-ticket rate limit (120/hour) does nothing to shape a fleet-wide surge. | - `RdpViewer`: **full jitter** backoff (`backoffDelayMs`, base 1s, cap 30s, 6 attempts) — **done**. Full jitter rather than plain exponential on purpose: plain backoff keeps the fleet synchronised, just hitting less often<br>- Retry instead of falling through to the proxy on the first failure — **done** (`mintGatewayAuthWithBackoff`), so a gateway blip cannot quietly move the whole fleet back into Python<br>- Silent auth refresh also backs off with jitter now, so refresh timers cannot converge during an outage — **done**<br>- Per-gateway admission control — **done** (`admit_connect`, `RDP_GATEWAY_ADMIT_PER_SECOND=5`, per-second bucket, per gateway, **fails open** so a broken limiter is never an outage of its own)<br>- `retry_after_ms` hint honoured by the viewer — **done** (503 + `Retry-After`; the viewer prefers the server's hint over its own backoff)<br>- Unit-tested: limit enforcement, wait hint, per-gateway isolation, fail-open, disabled-at-zero, atomicity under 16 threads — **done** | **80%** |

**Pending**

| Details of what is supposed to be done | What we will do |
|---|---|
| `RDP_GATEWAY_ADMIT_PER_SECOND=5` is a guess. The whole point of this action is behaviour under a real restart, and no restart has ever been measured — the number should come from Phase 6, not from a default. | - After the Phase 6 measurement, size the admission rate from what guacd actually absorbs on a cold start<br>- Prove it under the Phase 7 `gateway_loss` acceptance scenario: restart a node with N desktops live and confirm the reconnects spread instead of spiking<br>- Confirm no worker is pushed past their 5-minute grace by the backoff itself (6 attempts, 30s cap ≈ well inside it, but verify with real numbers) |

### Action 5 — Backend test harness and concurrency gates

| Details of what is supposed to be done | What we will do | % |
|---|---|---|
| There is no backend test suite at all — the only tests in the repo are the two script evaluators (`scripts/test_rdp_*.py`). The generation / compare-and-swap model is the mechanism the whole ownership design rests on, and it has only ever been reviewed, never executed under contention. Duplicate-tab **Switch here** has likewise never run against two real tabs. | - `backend/tests/` on pytest with `conftest.py` fixtures (`fakeredis`, two-gateway config, deterministic settings) — **done**; `pytest.ini`, `requirements-dev.txt`<br>- Runnable with no server at all — **done**. Most of the ownership model lives in Redis, so `fakeredis` covers it; Postgres-only gates are `@pytest.mark.postgres` and skip **with a printed reason**, never a silent pass<br>- **PostgreSQL concurrency gates** — **done** (`test_postgres_concurrency.py`): eight simultaneous allocation inserts leave exactly one open allocation; a row-locked takeover increments the generation before a stale disconnect can act; and concurrent end / force-stop / sweep transitions plus ticket redemption leave the machine unambiguously free. `claim`, `disconnect`, and `prepare_connect` now lock the allocation row where they mutate it; the partial-index collision becomes the normal `claim_race` response<br>- Generation safety: stale, future, wrong-allocation, permissive-null and string-vs-int comparisons — **done**<br>- Sweep safety rules: miss counting, streak clearing, per-machine isolation, unrecordable miss, and all four gateway-silence cases — **done**<br>- Degraded mode: both stores, recovery window, no-false-recovery, unreadable-Redis — **done**<br>- Throwaway scripts folded in (join-ticket single-use, cluster placement/drain/health, auth-json round-trip against the extension's wire format) — **done**<br>- GitHub Actions PostgreSQL job — **done** (`.github/workflows/backend-tests.yml` installs test dependencies, migrates a disposable PostgreSQL 16 database, then runs pytest) | **90%** |

**Pending**

| Details of what is supposed to be done | What we will do |
|---|---|
| Local implementation is complete. The remaining work is GitHub administration and execution: this checkout cannot turn a workflow into a required merge check or observe its first run. PostgreSQL is required to execute the new gates; Docker is unavailable on this workstation and no `DATABASE_URL_TEST` was supplied, so they correctly skip locally with a reason. | - Push the workflow and confirm the first `Backend tests` run passes against its PostgreSQL service<br>- In the GitHub branch-protection rule for the production branch, require the `Backend tests / pytest` check before merging<br>- Record the first green run; then this action is **100%** |

### Action 6 — Correct the stale design notes

| Details of what is supposed to be done | What we will do | % |
|---|---|---|
| Section 1 is the document that outlives the build, so a statement in it that no longer matches the code is a future bad decision. Two were wrong: capacity behaviour during the grace window was undefined, and §1.10 still listed decisions the implementation had already made. | - §1.6 — state that grace-window allocations hold their capacity slot, and why (the seat is being held for the returning worker) — **done**<br>- §1.10 — move settled items to Answered: auth-json chosen over a custom extension, and load-test thresholds now defined and enforced by both evaluators — **done**<br>- §1.10 — narrow the remaining datastore item to what is actually still open: runtime behaviour during an outage, pointing at Action 3 — **done**<br>- §1.9 — degraded-mode rows added now that Action 3 has defined the behaviour, plus the five new failure modes this phase introduced (unobserved tunnel death, orphan session, unconfirmed closure, unreachable gateway, media-node restart) — **done** | **100%** |

**Pending**

| Details of what is supposed to be done | What we will do |
|---|---|
| | |

---

## Progress summary (update as you go)

| Phase | Title | Overall % |
|---|---|---|
| Phase 1 | Safety | **95%** |
| Phase 2 | Errors and worker journey | **100%** |
| Phase 3 | Stop dropping sessions | **100%** |
| Phase 4 | Ownership + coordinator | **98%** |
| Phase 5 | Pixels on Guacamole | **93%** |
| Phase 6 | Split media + measure | **65%** |
| Phase 7 | Redundancy + acceptance | **62%** |
| Phase 8 | Close the silent-failure gaps | **92%** |

When every phase is **100%**, delete **Section 2** and keep **Section 1** as the permanent design reference.
