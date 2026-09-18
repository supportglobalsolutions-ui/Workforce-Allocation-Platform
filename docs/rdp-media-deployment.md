# Phase 6: single-VPS topology (media split cancelled)

Status: **single-VPS topology only** — a separate media host will not be provisioned.
**Session cap:** we do **not** enforce a numeric max-session limit
(`RDP_MAX_LIVE_SESSIONS=0` = unlimited). Do not size or apply a production
ceiling from a ramp.
The coordinator (Phase 4) and direct ticket-authenticated browser gateway (Phase 5)
are live on this same host. Compose media/control split files remain in-repo for a
possible future split; they are not part of the current ops plan.

> **Cancelled:** provisioning `workforce-rdp-prod` / moving Guacamole to a second VPS
> (§1–3 below). Skip those sections unless the single-VPS decision is reversed.
>
> **Cancelled:** measured load ramp to set `RDP_MAX_LIVE_SESSIONS` (§4). Scripts and
> CSV templates remain for optional diagnostics only.

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
are still reachable from other containers on the same host unless firewall rules
block them — treat published ports as host-local, not internet-private.

## 2. DNS, TLS, Compose split

*(Reference only — cancelled for live ops. See architecture Phase 6.)*

## 3. Data migration and cutover

*(Reference only — cancelled for live ops.)*

Do not combine this move with a Guacamole or PostgreSQL major-version upgrade.

## 4. Capacity measurement (optional diagnostics only)

**Not part of the live plan.** Ops does not set a max-session number from this
section. If you still want host-pressure numbers for resizing the VPS (not for
`RDP_MAX_LIVE_SESSIONS`), the ramp protocol and `scripts/rdp_capacity.py` remain
available; leave production at `RDP_MAX_LIVE_SESSIONS=0`.

| Acceptance item | Result |
|---|---|
| Provisioned media host and migrated data | **Cancelled** — single-VPS only; Guacamole stays on the existing host |
| Direct gateway + API restart acceptance | Pending Phase 4/5 / Section 3 live checks |
| Measured ramp → set `RDP_MAX_LIVE_SESSIONS` | **Cancelled** — unlimited (`0`); no numeric session ceiling |
| Production cap from evidence | **N/A** — policy is no fixed max sessions |
