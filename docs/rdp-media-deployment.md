# Phase 6: media migration and capacity acceptance

Status: deployment artifacts prepared; no server provisioned or real capacity measured.
This runbook supersedes the single-host Guacamole placement and estimated sizing in
deployment.md for Phase 6. Keep the current cap of 6 until acceptance succeeds.
The coordinator (Phase 4) and direct ticket-authenticated browser gateway (Phase 5)
are prerequisites for the final topology. The current Python relay can reach this
media host, but an API restart will still interrupt it.

## 1. Provision and network

Create `workforce-rdp-prod` in the control host's region, with an operator-selected
size and SSH key. Attach both hosts to the same private network/subnet. Example
addresses below are **placeholders**: control `10.20.0.2`, media `10.20.0.3`.
Record server ID, region, vCPU, RAM, NIC speed, public/private addresses and image
versions with the acceptance results. No capacity is implied by the chosen size.

Install Docker Compose v2, Nginx and Certbot using deployment.md. Allow public
80/443, restrict SSH to operations IPs, and allow private TCP 8081 only from the
control host. Permit media egress to each Windows host on its configured RDP port;
update Windows/provider allowlists for the new media egress IP. Kuma and API
preflight probes still need control-host access to Windows.

The media Compose file publishes only localhost 8080; PostgreSQL and guacd have no
published ports. Nginx binds private 8081 and enforces a control-IP allowlist.
Private HTTP assumes a trusted network; use an encrypted overlay or private TLS
if your threat model requires encryption between hosts. Docker-published ports
can bypass UFW, hence the loopback binding and host Nginx listener.
See [Docker firewall documentation](https://docs.docker.com/engine/network/packet-filtering-firewalls/).

## 2. Prepare and restore media data

Use commands from the repository's `infrastructure` directory on each Linux host.
Do not combine this move with a Guacamole or PostgreSQL major-version upgrade.
Inspect the source containers' actual image versions/digests (the old file uses
`latest`). Set the same Guacamole release in `.env.media`; test its JDBC variables
against the [official image documentation](https://guacamole.apache.org/doc/gug/guacamole-docker.html).
The file supports the old `POSTGRESQL_USER` and newer `POSTGRESQL_USERNAME` names.

On media:

```bash
cp media/.env.example .env.media
chmod 600 .env.media
# Edit version and a random database password before continuing.
docker compose --env-file .env.media -f compose.media.yml config --quiet
docker compose --env-file .env.media -f compose.media.yml up -d guac_db
```

Drain workers and disable new claims/connection provisioning during a maintenance
window. Confirm zero active tunnels before stopping the source Guacamole. Stop
the API if necessary to prevent writes; preserve Redis and its existing locks.
On control, make the final backup after stopping the writers:

```bash
docker compose -f docker-compose.yml stop guacamole guacd
umask 077
docker compose -f docker-compose.yml exec -T guac_db pg_dump -U guacamole_user -d guacamole_db --no-owner --no-acl > guacamole-migration.sql
```

Check the dump command exit status, securely copy the dump to media, then restore:

```bash
docker compose --env-file .env.media -f compose.media.yml exec -T guac_db psql -v ON_ERROR_STOP=1 -U guacamole_user -d guacamole_db < guacamole-migration.sql
docker compose --env-file .env.media -f compose.media.yml up -d
docker compose --env-file .env.media -f compose.media.yml ps
```

This initializes a fresh database by **restore**, not the checked-in init SQL.
Never restore into an already populated database. Validate user, connection and
permission counts against the source; existing connection IDs must survive.
Keep a protected backup until rollback is no longer needed.

## 3. Nginx, DNS and cutover

Copy `nginx/media.conf.example` into Nginx sites-available, replace the domain and
both private addresses, and enable it. Run `sudo nginx -t` before reloading.
Point `guac.` A to the media public IPv4; update or remove any stale AAAA record.
If publishing AAAA, add IPv6 listeners and verify IPv6 routing/firewalls too.
Use DNS-only routing. On media run:

```bash
sudo certbot --nginx -d guac.YOUR_DOMAIN
sudo certbot renew --dry-run
```

On control set `GUACAMOLE_URL=http://10.20.0.3:8081/guacamole` in backend `.env`.
Preserve the restored Guacamole admin credentials (rotate separately if required).
Restart the API, then verify provisioning, worker claim, connect, reconnect,
End and force-stop. Test private access from control and rejection from another
host. Confirm public session-data URLs return 404, TLS is valid, and 5432/4822/8080
are unreachable publicly. Do not paste admin tokens into shell history.

Only after verification, stop the old `guac_db`. Manage control services with:

```bash
docker compose -f compose.control.yml config --quiet
docker compose -f compose.control.yml up -d
```

The control file preserves the Compose project, container names, network, and
external Kuma volume. Redis has no persistent volume in the original setup:
recreating it loses locks. Keep claims disabled and all sessions drained while
switching, and verify allocations/locks before reopening. Do not use
`--remove-orphans` or `down -v`; retain the old media containers and volume for
rollback. API stays in systemd; install the coordinator on control when Phase 4
provides its executable. Do not invent a service pointing at a missing module.

Rollback: drain and disable writes again, stop new media writers, restore old
DNS and backend URL, start old media services, and restart API. If any provisioning
or credential changes occurred after cutover, reconcile or reverse-migrate those
DB changes before reopening claims. Never operate both copies as writable gateways.

## 4. Measured ramp (operator-run)

Browser automation is optional; the protocol below is complete without it.
Use a non-production cohort with one authorized worker and one distinct Windows
machine per simultaneous desktop. Do not load a production workforce implicitly.
Choose intended concurrency, representative screen resolution, workload, regions,
and network profiles. Copy `load-test/limits.example.json` and agree thresholds
before running; the example values are proposed targets, not measured guarantees.

Ramp through increasing plateaus (for example 1, 3, 6, then increments toward the
intended concurrency). Hold each plateau for at least the configured soak time
with all desktops rendering representative activity. At each plateau:

1. Time connect request to first **visible desktop frame** in the browser; a
   connected socket or Guacamole sync message alone is insufficient. Record every
   attempt including failures; use nearest-rank p95 over successful observations.
2. Drop/recover the browser network for every participant inside the 5-minute
   grace; measure recovery to visible frame and count failed reconnects.
3. Count unexpected tunnel drops separately from deliberate disconnects. Record
   actual connected session-minutes and simultaneous steady-state minutes.
4. Sample CPU (normalized across all host cores), memory and network at 5-second
   intervals on both hosts; retain raw samples. Enter media peak CPU and memory
   percentages in CSV. Check control saturation and network limits separately.
5. Verify End/force-stop close tunnels before freeing locks, and new claims at
   capacity fail clearly. Stop the ramp if targets fail or resources saturate.

Copy the header-only measurements CSV and enter one aggregate row per plateau.
Retain raw per-session timings, errors, concurrency timeline, versions and host
samples as evidence. The evaluator validates aggregates; it cannot authenticate
measurements or establish simultaneity from aggregate counts.

```bash
python scripts/rdp_capacity.py output/measurements.csv --limits output/limits.json > output/capacity-report.json
```

Exit 1 means a measured stage failed; invalid/missing data exits 2. The candidate
cap is the highest contiguous passing tested plateau minus the configured
reconnect reserve, rounded down. Never extrapolate beyond measured concurrency.
Insufficient data must not be replaced by estimates or synthetic test results.
The JSON report also includes `recommended_settings`, containing the exact
single-media-host `RDP_MAX_LIVE_SESSIONS` and `RDP_GATEWAY_CAPACITY` candidate.
It is an output for review, never an automatic production edit.

Before applying the candidate, finish Phase 4/5, verify browser pixels go directly
to `guac.`, and prove an API restart preserves live desktops. Repeat at the candidate
cap for the intended duration/workload and approve the raw evidence. Then set
`RDP_MAX_LIVE_SESSIONS` identically for API and coordinator, restart control services,
test admission at the cap and cap+1, and record date/hardware/results/cap here.

| Acceptance item | Result |
|---|---|
| Provisioned media host and migrated data | Pending |
| Direct gateway + API restart acceptance | Pending Phase 4/5 |
| Intended concurrency and agreed thresholds | Pending |
| Measured first-frame / reconnect p95 / drop rate | Not measured |
| Production cap from evidence | Not set; existing default remains 6 |
