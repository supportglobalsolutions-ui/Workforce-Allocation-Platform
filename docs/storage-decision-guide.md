# Storage decision guide

Team standard for choosing where data lives. Canonical schema: [data-models.md](data-models.md).

## Write path (non-negotiable)

1. **PostgreSQL first** — all canonical writes commit here.
2. **Firebase mirror** — after PG commit, upsert/delete denormalized docs for live UI only.
3. **Redis** — ephemeral locks and heartbeats; never the source of truth.

If Firebase is unavailable, PG history stays intact. If PG is unavailable, reject new writes.

## Decision tree

For every new field or entity, ask in order:

1. **Must it survive forever and be auditable or used in payroll?** → PostgreSQL only.
2. **Does the UI need it in under one second without polling?**
   - If yes: **Is it derived from PG and safe to lose temporarily?** → Firebase mirror (after PG commit).
   - If no → PostgreSQL only.
3. **Is it ephemeral coordination with TTL under one hour?** → Redis only.
4. Otherwise → PostgreSQL only.

## Store roles

| Store | Use for | Never use for |
| :--- | :--- | :--- |
| **PostgreSQL** | All 22 canonical tables, FKs, payroll, audit, CRUD | Live heartbeats, claim locks |
| **Firebase Firestore** | 5 mirror paths (see Appendix B in data-models.md) | Source of truth, payroll, audit, partner terms |
| **Firebase Auth** | Login UID, custom claims | Business entities |
| **Redis** | `lock:rdp:*`, `heartbeat:session:*`, `rate:claim:*` | Queryable or exportable data |

## Firestore mirror paths (read-only from clients)

| Path | Purpose |
| :--- | :--- |
| `rdp_status/{rdp_id}` | Live RDP board |
| `active_sessions/{session_id}` | Session timer / heartbeat display |
| `shift_notifications/{worker_id}/notifications/{notif_id}` | Shift approved/rejected, RDP assigned |
| `leaderboard/current_period` | Top workers snapshot (refreshed every 5 min) |
| `system_alerts/{alert_id}` | Machine offline, idle session, payroll exceptions |

Implementation: [backend/services/firebase_mirror.py](../backend/services/firebase_mirror.py).

## Code review checklist

- [ ] New entity default is PostgreSQL unless it passes the decision tree above.
- [ ] No client writes to Firestore mirrors (Admin SDK / backend only).
- [ ] Router commits PG before calling `firebase_mirror`.
- [ ] Payroll, audit, partner, and MCQ data stay PG-only.
