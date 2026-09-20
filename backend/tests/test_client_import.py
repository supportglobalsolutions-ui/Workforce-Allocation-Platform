"""Unit tests for client CSV / Excel import parsing."""
from decimal import Decimal

import pytest

from models.enums import ClientContractStatusEnum
from services.client_import import (
    parse_active_status,
    parse_billing_rate,
    parse_client_import_file,
    rows_from_csv,
)


def test_parse_billing_rate_currency_formats():
    assert parse_billing_rate("$18.70") == Decimal("18.70")
    assert parse_billing_rate("15.20") == Decimal("15.20")
    assert parse_billing_rate("$1,020.00") == Decimal("1020.00")
    assert parse_billing_rate("") is None
    assert parse_billing_rate(None) is None


def test_parse_active_status_yes_no():
    assert parse_active_status("Yes") == ClientContractStatusEnum.active
    assert parse_active_status("No") == ClientContractStatusEnum.paused
    assert parse_active_status("paused") == ClientContractStatusEnum.paused
    assert parse_active_status("ended") == ClientContractStatusEnum.ended
    assert parse_active_status("") is None


def test_rows_from_csv_sheet_headers():
    raw = (
        "Client,Billing Rate USD/hr,Active?,Notes\n"
        "Sam - Can,$18.70,Yes,\n"
        "Kev,$15.20,Yes,Review before invoicing\n"
    ).encode("utf-8")
    rows = rows_from_csv(raw)
    assert len(rows) == 2
    assert rows[0]["name"] == "Sam - Can"
    assert parse_billing_rate(rows[0]["billing_rate_usd"]) == Decimal("18.70")
    assert parse_active_status(rows[0]["active"]) == ClientContractStatusEnum.active
    assert rows[1]["notes"] == "Review before invoicing"


def test_parse_file_sniffs_csv():
    data = b"Client,Billing Rate USD/hr,Active?\nLizzy,$20.00,Yes\n"
    rows = parse_client_import_file("clients.csv", data)
    assert len(rows) == 1
    assert rows[0]["name"] == "Lizzy"


def test_missing_client_column_errors():
    with pytest.raises(ValueError, match="Client"):
        rows_from_csv(b"Foo,Bar\n1,2\n")
