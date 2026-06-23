# Uptime Kuma — RDP Machine Monitoring

Uptime Kuma monitors RDP machines via TCP ping. Add one TCP monitor per RDP host.

## Setup
1. Access Uptime Kuma at http://localhost:3001 (see docker-compose.yml)
2. Add a monitor: Type = TCP Port, Host = <rdp-machine-ip>, Port = 3389
3. Set check interval to 60 seconds
4. Notification alerts go to the ops team channel

## No config files are committed here — all monitor definitions live inside the Uptime Kuma database volume.
