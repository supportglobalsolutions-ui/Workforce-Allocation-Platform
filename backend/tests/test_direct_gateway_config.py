"""Fail-fast production validation for the direct Guacamole media path."""
import pytest

from core.config import settings
from core.security_validation import validate_production_settings


@pytest.fixture
def valid_production(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "DATABASE_URL", "postgresql://safe:password@db.example/workforce")
    monkeypatch.setattr(settings, "GUACAMOLE_PASSWORD", "a-strong-non-default-password")
    monkeypatch.setattr(settings, "OTP_PEPPER", "test-pepper")
    monkeypatch.setattr(settings, "SESSION_COOKIE_SECRET", "test-cookie-secret")
    monkeypatch.setattr(settings, "RDP_DIRECT_GATEWAY_MODE", "on")
    monkeypatch.setattr(settings, "GUACAMOLE_PUBLIC_URL", "https://guac.example.test")
    monkeypatch.setattr(settings, "GUACAMOLE_JSON_SECRET_KEY", "0123456789abcdef0123456789abcdef")


def test_direct_gateway_accepts_complete_production_configuration(valid_production):
    validate_production_settings()


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("GUACAMOLE_PUBLIC_URL", "http://guac.example.test", "HTTPS guac. origin"),
        ("GUACAMOLE_JSON_SECRET_KEY", "not-a-valid-key", "32-hex-character"),
        ("RDP_DIRECT_GATEWAY_MODE", "enabled", "off, pilot, or on"),
    ],
)
def test_direct_gateway_rejects_incomplete_production_configuration(
    valid_production, monkeypatch, field, value, message
):
    monkeypatch.setattr(settings, field, value)
    with pytest.raises(RuntimeError, match=message):
        validate_production_settings()
