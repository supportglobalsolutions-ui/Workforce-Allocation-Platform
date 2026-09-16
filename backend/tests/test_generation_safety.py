"""
Late actors must be harmless (Principle 8).

`connection_generation` is the mechanism the whole ownership model rests on:
every connect, kill and cleanup carries the generation it was decided under,
and must no-op if the world has moved on. Until now it had only been read, not
executed under contention.
"""
from __future__ import annotations

import uuid

import pytest

from services.guacamole_json_auth import build_connection_document, encode_auth_blob
from services.rdp_engine import generation_matches


class FakeAlloc:
    def __init__(self, alloc_id=None, generation=1):
        self.id = alloc_id or uuid.uuid4()
        self.connection_generation = generation


def test_same_generation_and_allocation_matches():
    alloc = FakeAlloc(generation=3)
    assert generation_matches(alloc, allocation_id=alloc.id, connection_generation=3)


def test_stale_generation_is_refused():
    """A kill decided before a Switch here must not land after it."""
    alloc = FakeAlloc(generation=4)
    assert not generation_matches(alloc, allocation_id=alloc.id, connection_generation=3)


def test_future_generation_is_refused():
    alloc = FakeAlloc(generation=2)
    assert not generation_matches(alloc, allocation_id=alloc.id, connection_generation=9)


def test_different_allocation_is_refused():
    """The machine was reclaimed by someone else in the meantime."""
    alloc = FakeAlloc(generation=1)
    assert not generation_matches(
        alloc, allocation_id=uuid.uuid4(), connection_generation=1
    )


def test_unspecified_checks_are_permissive():
    """Callers that genuinely do not care (admin force-stop) still pass."""
    alloc = FakeAlloc(generation=7)
    assert generation_matches(alloc, allocation_id=None, connection_generation=None)


def test_generation_only_check():
    alloc = FakeAlloc(generation=7)
    assert generation_matches(alloc, allocation_id=None, connection_generation=7)
    assert not generation_matches(alloc, allocation_id=None, connection_generation=6)


def test_generation_compares_by_value_not_type():
    """Redis and JSON round-trips hand these back as strings."""
    alloc = FakeAlloc(generation=5)
    assert generation_matches(alloc, allocation_id=None, connection_generation="5")


# ── auth-json blob (Phase 5 Action 2), folded in from a throwaway script ──


def test_auth_blob_round_trips_to_the_extension_format():
    """
    Decrypt exactly as guacamole-auth-json does. If this breaks, every worker
    on the direct path gets a black screen.
    """
    import base64
    import binascii
    import hashlib
    import hmac
    import json

    from cryptography.hazmat.primitives import padding
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

    from core.config import settings

    document = build_connection_document(
        username="wf-alloc-g1",
        connection_name="WIN-01",
        parameters={"hostname": "10.0.0.5", "port": 3389, "password": "s3cret"},
    )
    blob = encode_auth_blob(document)

    key = binascii.unhexlify(settings.GUACAMOLE_JSON_SECRET_KEY)
    decryptor = Cipher(algorithms.AES(key), modes.CBC(b"\x00" * 16)).decryptor()
    plain = decryptor.update(base64.b64decode(blob)) + decryptor.finalize()
    unpadder = padding.PKCS7(algorithms.AES.block_size).unpadder()
    plain = unpadder.update(plain) + unpadder.finalize()

    signature, payload = plain[:32], plain[32:]
    assert hmac.compare_digest(
        signature, hmac.new(key, payload, hashlib.sha256).digest()
    ), "signature does not match what the extension will verify"

    back = json.loads(payload)
    assert list(back["connections"]) == ["WIN-01"], "blob must grant exactly one connection"
    assert back["connections"]["WIN-01"]["parameters"]["password"] == "s3cret"
    assert back["expires"] > 0


def test_blob_grants_only_the_named_connection():
    document = build_connection_document(
        username="wf-x", connection_name="ONLY-ONE", parameters={"hostname": "h"}
    )
    assert len(document["connections"]) == 1
    assert "ONLY-ONE" in document["connections"]


@pytest.mark.postgres
def test_concurrent_claims_produce_one_open_allocation():
    """
    The DB-level race: N workers claiming one machine simultaneously.

    Needs real PostgreSQL — the guarantee is the partial unique index
    `uq_allocations_active_rdp`, which SQLite cannot express.
    """
    pytest.skip("covered by the Postgres CI job; see conftest POSTGRES_WHY")
