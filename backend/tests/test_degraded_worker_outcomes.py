"""Worker RDP actions must fail calmly when ownership stores are unavailable."""
import pytest
import redis
from fastapi import HTTPException
from sqlalchemy.exc import OperationalError

from routers.rdp import _datastore_retry
from services.rdp_degraded import is_datastore_error


@pytest.mark.parametrize(
    "exc",
    [redis.exceptions.ConnectionError("Redis unavailable"), OperationalError("SELECT 1", {}, OSError("Postgres unavailable"))],
)
def test_datastore_errors_become_retryable_worker_responses(exc):
    assert is_datastore_error(exc)
    with pytest.raises(HTTPException) as raised:
        _datastore_retry("claim", exc)
    response = raised.value
    assert response.status_code == 503
    assert response.detail == "Remote desktop service is temporarily unavailable. Please try again shortly."
    assert response.headers["Retry-After"] == "5"


def test_non_datastore_error_is_not_disguised_as_an_outage():
    error = ValueError("invalid RDP setting")
    assert not is_datastore_error(error)
    with pytest.raises(ValueError, match="invalid RDP setting"):
        _datastore_retry("join-ticket", error)


def test_claim_and_join_ticket_handlers_catch_datastore_failures():
    """Guard the two HTTP contracts even if implementation is refactored."""
    import inspect

    from conftest import find_endpoint

    for name in ("claim_rdp_resource", "create_rdp_join_ticket"):
        source = inspect.getsource(find_endpoint(name))
        assert "redis_lib.RedisError" in source
        assert "SQLAlchemyError" in source
        assert "_datastore_retry" in source
