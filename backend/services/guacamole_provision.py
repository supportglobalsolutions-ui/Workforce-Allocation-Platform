"""
Auto-provision Guacamole connections for RDP machines.

Admins register a machine once in this platform (host, port, RDP credentials);
the connection is created/updated in Guacamole over its REST API and the
returned identifier is stored on the RDPResource. Nobody has to open the
Guacamole UI.

Credentials are never persisted in the app database — they are forwarded to
Guacamole, which is the system of record for connection parameters.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

import redis as redis_lib

from core.crypto import decrypt_secret, encrypt_secret, encryption_available
from core.guacamole import GuacamoleClient
from models.rdp_machine import RDPResource

logger = logging.getLogger(__name__)

# Cap the Windows session at one viewer. Do not also cap per Guacamole user:
# every worker tunnel authenticates as the platform account, so a per-user
# limit of 1 blocks retries with "already in use by this user".
DEFAULT_ATTRIBUTES: dict[str, str] = {
    "max-connections": "1",
    "max-connections-per-user": "",
}

# Sane defaults for Windows RDP over guacd.
DEFAULT_PARAMETERS: dict[str, str] = {
    "security": "any",
    "ignore-cert": "true",
    "resize-method": "display-update",
    "enable-drive": "false",
    "disable-audio": "true",
    # The RDP Graphics Pipeline requires 32 bpp; guacd logged a warning and
    # overrode anything lower anyway.
    "color-depth": "32",
}


class GuacamoleProvisionError(RuntimeError):
    """Raised when a connection could not be created or updated."""


@dataclass
class ProvisionResult:
    connection_id: str
    created: bool
    name: str


def _base_parameters(
    resource: RDPResource,
    *,
    username: str | None,
    password: str | None,
    domain: str | None,
    existing: dict[str, str] | None = None,
) -> dict[str, str]:
    # Existing values first so credentials and any hand-added parameters
    # survive, then our managed defaults on top — otherwise a stale stored
    # value (e.g. an old colour depth) could never be corrected by a re-sync.
    params: dict[str, str] = {**(existing or {}), **DEFAULT_PARAMETERS}
    params["hostname"] = (resource.monitor_host or "").strip()
    params["port"] = str(resource.monitor_port or 3389)
    # Only overwrite credentials when new ones are supplied; otherwise keep
    # whatever Guacamole already has (so an edit doesn't wipe the password).
    if username is not None:
        params["username"] = username.strip()
    if password is not None:
        params["password"] = password
    if domain is not None:
        params["domain"] = domain.strip()
    return {k: v for k, v in params.items() if v is not None}


def sync_connection(
    redis_client: redis_lib.Redis,
    resource: RDPResource,
    *,
    username: str | None = None,
    password: str | None = None,
    domain: str | None = None,
) -> ProvisionResult:
    """
    Create or update the Guacamole connection backing `resource`.

    Resolution order:
      1. `resource.guacamole_connection_id` if it still exists in Guacamole.
      2. An existing connection whose name matches the nickname (adopt it).
      3. Create a new connection.

    Returns the identifier to store on the resource. Raises
    GuacamoleProvisionError on any failure (caller decides how loud to be).
    """
    host = (resource.monitor_host or "").strip()
    if not host:
        raise GuacamoleProvisionError(
            "Set the machine's host/IP before provisioning a Guacamole connection."
        )

    # Fall back to the credentials stored on the machine. This is what makes
    # rebuilding on a fresh Guacamole automatic: its database starts empty, so
    # without these the connection would be created with no login.
    if username is None:
        username = resource.rdp_username
    if password is None:
        password = decrypt_secret(resource.rdp_password_enc)
    if domain is None:
        domain = resource.rdp_domain

    name = resource.nickname.strip()
    guac = GuacamoleClient(redis_client)

    try:
        existing_id: str | None = None
        existing_params: dict[str, str] = {}

        if resource.guacamole_connection_id:
            found = guac.get_connection(resource.guacamole_connection_id)
            if found:
                existing_id = str(resource.guacamole_connection_id)
                existing_params = guac.get_connection_parameters(existing_id)

        if existing_id is None:
            by_name = guac.find_connection_by_name(name)
            if by_name:
                existing_id = str(by_name["identifier"])
                existing_params = guac.get_connection_parameters(existing_id)
                logger.info(
                    "Adopting existing Guacamole connection %s for RDP %s",
                    existing_id,
                    name,
                )

        params = _base_parameters(
            resource,
            username=username,
            password=password,
            domain=domain,
            existing=existing_params,
        )

        if existing_id:
            guac.update_connection(existing_id, name=name, parameters=params,
                                   attributes=DEFAULT_ATTRIBUTES)
            return ProvisionResult(connection_id=existing_id, created=False, name=name)

        new_id = guac.create_connection(
            name=name, parameters=params, attributes=DEFAULT_ATTRIBUTES
        )
        return ProvisionResult(connection_id=new_id, created=True, name=name)
    except GuacamoleProvisionError:
        raise
    except Exception as exc:  # httpx errors, auth failures, unreachable server
        detail = getattr(getattr(exc, "response", None), "text", "") or str(exc)
        raise GuacamoleProvisionError(
            f"Guacamole provisioning failed ({type(exc).__name__}): {detail[:300]}"
        ) from exc


def connection_parameters_for(
    redis_client: redis_lib.Redis, resource: RDPResource
) -> dict[str, str]:
    """
    Full RDP parameters for one machine, for embedding in an auth-json blob.

    Preference order is deliberate. The machine row is authoritative when it
    holds credentials (encrypted at rest here, and rebuildable on a fresh
    Guacamole); otherwise we read them back from Guacamole, which is the
    system of record for connections an admin created by hand.

    This runs server-side only — the values go straight into the encrypted
    blob and are never readable by the browser.
    """
    host = (resource.monitor_host or "").strip()
    if not host:
        raise GuacamoleProvisionError("This machine has no host/IP configured.")

    guac_params: dict[str, str] = {}
    if resource.guacamole_connection_id:
        try:
            guac_params = GuacamoleClient(redis_client).get_connection_parameters(
                resource.guacamole_connection_id
            )
        except Exception as exc:
            logger.warning(
                "Could not read Guacamole parameters for %s: %s", resource.nickname, exc
            )
            guac_params = {}

    username = resource.rdp_username or guac_params.get("username")
    password = decrypt_secret(resource.rdp_password_enc) or guac_params.get("password")
    domain = resource.rdp_domain or guac_params.get("domain")

    if not username or not password:
        raise GuacamoleProvisionError(
            "This machine has no saved sign-in. Ask an admin to set its RDP credentials."
        )

    return _base_parameters(
        resource,
        username=username,
        password=password,
        domain=domain,
        existing=guac_params,
    )


def store_credentials(
    resource: RDPResource,
    *,
    username: str | None,
    password: str | None,
    domain: str | None,
) -> bool:
    """
    Persist supplied credentials on the machine (password encrypted).

    Only overwrites what was actually provided, so editing a machine without
    retyping the password keeps the stored one. Returns True if anything
    changed, so the caller knows whether to commit.
    """
    changed = False
    if username is not None and username.strip():
        resource.rdp_username = username.strip()
        changed = True
    if domain is not None:
        resource.rdp_domain = domain.strip() or None
        changed = True
    if password:
        if not encryption_available():
            logger.error(
                "Cannot store the RDP password for %s: no encryption key configured. "
                "Set SECRET_ENCRYPTION_KEY or OTP_PEPPER.",
                resource.nickname,
            )
        else:
            resource.rdp_password_enc = encrypt_secret(password)
            changed = True
    return changed


def has_stored_credentials(resource: RDPResource) -> bool:
    return bool(resource.rdp_username and resource.rdp_password_enc)


def remove_connection(redis_client: redis_lib.Redis, connection_id: str) -> bool:
    """Best-effort delete of a Guacamole connection."""
    try:
        return GuacamoleClient(redis_client).delete_connection(connection_id)
    except Exception as exc:
        logger.warning("Guacamole delete_connection %s failed: %s", connection_id, exc)
        return False
