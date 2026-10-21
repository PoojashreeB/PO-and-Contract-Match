import os
import sys
from types import SimpleNamespace

import pytest

import sap.rfc_client as rfc_client
from sap.rfc_client import (
    PurchaseOrderNotFoundError,
    SapApiError,
    SapAuthError,
    fetch_po_record,
)
from schemas.sap_schema import SapConfig

CONFIG = SapConfig(
    ashost="sap.example.com",
    sysnr="57",
    client="100",
    username="TECH_USER",
    password="super-secret",
)

EKKO_ROW = {
    "EBELN": "4500000123",
    "BEDAT": "20250815",
    "LIFNR": "0000089234",
    "ZTERM": "0002",
    "ZBD1T": "14",
    "ZBD2T": "30",
    "ZBD3T": "0",
    "WAERS": "INR",
    "KDATB": "20250901",
    "KDATE": "20260831",
}

EKPO_ROWS = [
    {"EBELP": "00010", "NETWR": "4000000.00", "LOEKZ": ""},
    {"EBELP": "00020", "NETWR": "500000.00", "LOEKZ": ""},
    {"EBELP": "00030", "NETWR": "999.00", "LOEKZ": "L"},
]

LFA1_ROWS = [{"NAME1": "ABC Engineering Services Pvt. Ltd."}]


class RFCError(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class LogonError(RFCError):
    pass


class CommunicationError(RFCError):
    pass


class ABAPApplicationError(RFCError):
    pass


def _fake_pyrfc(monkeypatch, tables: dict, connect_error: Exception | None = None):
    """Fake pyrfc whose RFC_READ_TABLE serves `tables` (name -> rows or an exception)."""
    calls: list[dict] = []
    connections: list[dict] = []

    class Connection:
        def __init__(self, **params):
            if connect_error is not None:
                raise connect_error
            connections.append(params)

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def call(self, name, **params):
            assert name == "RFC_READ_TABLE"
            calls.append(params)
            rows = tables.get(params["QUERY_TABLE"], [])
            if isinstance(rows, Exception):
                raise rows
            fields = [f["FIELDNAME"] for f in params["FIELDS"]]
            return {"DATA": [{"WA": "|".join(row.get(f, "") for f in fields)} for row in rows]}

    fake = SimpleNamespace(
        Connection=Connection,
        RFCError=RFCError,
        LogonError=LogonError,
        CommunicationError=CommunicationError,
    )
    monkeypatch.setattr(rfc_client, "_load_pyrfc", lambda: fake)
    return calls, connections


def _all_tables(**overrides):
    return {"EKKO": [EKKO_ROW], "EKPO": EKPO_ROWS, "LFA1": LFA1_ROWS, **overrides}


def test_fetch_maps_purchase_order_to_sap_record(monkeypatch):
    calls, connections = _fake_pyrfc(monkeypatch, _all_tables())

    record = fetch_po_record(CONFIG, " 4500000123 ")

    assert record == {
        "po_number": "4500000123",
        "po_date": "2025-08-15",
        "contract_period_start": "2025-09-01",
        "contract_period_end": "2026-08-31",
        "contract_price": "INR 4,500,000.00",
        "payment_terms": "Net 30 days",
        "vendor_name": "ABC Engineering Services Pvt. Ltd.",
        "vendor_code": "89234",
    }
    assert connections == [
        {"ashost": "sap.example.com", "sysnr": "57", "client": "100", "user": "TECH_USER", "passwd": "super-secret"}
    ]
    assert [(c["QUERY_TABLE"], c["OPTIONS"]) for c in calls] == [
        ("EKKO", [{"TEXT": "EBELN = '4500000123'"}]),
        ("EKPO", [{"TEXT": "EBELN = '4500000123'"}]),
        ("LFA1", [{"TEXT": "LIFNR = '0000089234'"}]),
    ]


def test_fetch_connects_through_gateway_when_configured(monkeypatch):
    _, connections = _fake_pyrfc(monkeypatch, _all_tables())
    config = CONFIG.model_copy(update={"gwhost": "10.0.0.5", "gwserv": "sapgw57"})

    fetch_po_record(config, "4500000123")

    assert connections[0]["gwhost"] == "10.0.0.5"
    assert connections[0]["gwserv"] == "sapgw57"


def test_load_pyrfc_puts_sdk_lib_on_path(monkeypatch, tmp_path):
    monkeypatch.setenv("SAPNWRFC_HOME", str(tmp_path))
    monkeypatch.setenv("PATH", "C:\\Windows")
    monkeypatch.setitem(sys.modules, "pyrfc", None)

    with pytest.raises(SapApiError):
        rfc_client._load_pyrfc()

    assert os.environ["PATH"].split(os.pathsep)[0] == str(tmp_path / "lib")


def test_fetch_pads_short_numeric_po_numbers(monkeypatch):
    calls, _ = _fake_pyrfc(monkeypatch, _all_tables())

    fetch_po_record(CONFIG, "123")

    assert calls[0]["OPTIONS"] == [{"TEXT": "EBELN = '0000000123'"}]


def test_fetch_escapes_quotes_in_po_number(monkeypatch):
    calls, _ = _fake_pyrfc(monkeypatch, _all_tables())

    fetch_po_record(CONFIG, "45'01")

    assert calls[0]["OPTIONS"] == [{"TEXT": "EBELN = '45''01'"}]


def test_fetch_keeps_alphanumeric_vendor_codes(monkeypatch):
    _fake_pyrfc(monkeypatch, _all_tables(EKKO=[{**EKKO_ROW, "LIFNR": "USSU-VSF04"}]))

    record = fetch_po_record(CONFIG, "4500000123")

    assert record["vendor_code"] == "USSU-VSF04"


def test_fetch_reads_negative_values_with_trailing_minus(monkeypatch):
    items = [{"EBELP": "00010", "NETWR": "100.00", "LOEKZ": ""}, {"EBELP": "00020", "NETWR": "25.50-", "LOEKZ": ""}]
    _fake_pyrfc(monkeypatch, _all_tables(EKPO=items))

    record = fetch_po_record(CONFIG, "4500000123")

    assert record["contract_price"] == "INR 74.50"


def test_fetch_uses_header_target_value_for_contracts(monkeypatch):
    header = {**EKKO_ROW, "BSTYP": "K", "KTWRT": "200000.00"}
    items = [{"EBELP": "00010", "NETWR": "0.00", "ZWERT": "500.00", "LOEKZ": ""}]
    _fake_pyrfc(monkeypatch, _all_tables(EKKO=[header], EKPO=items))

    record = fetch_po_record(CONFIG, "4600000001")

    assert record["contract_price"] == "INR 200,000.00"


def test_fetch_sums_item_target_values_when_agreement_header_has_none(monkeypatch):
    header = {**EKKO_ROW, "BSTYP": "L", "KTWRT": "0.00"}
    items = [
        {"EBELP": "00010", "NETWR": "0.00", "ZWERT": "4800000.00", "LOEKZ": ""},
        {"EBELP": "00020", "NETWR": "0.00", "ZWERT": "200000.00", "LOEKZ": ""},
        {"EBELP": "00030", "NETWR": "0.00", "ZWERT": "999.00", "LOEKZ": "L"},
    ]
    _fake_pyrfc(monkeypatch, _all_tables(EKKO=[header], EKPO=items))

    record = fetch_po_record(CONFIG, "5600001716")

    assert record["contract_price"] == "INR 5,000,000.00"


def test_fetch_leaves_out_vendor_name_when_vendor_lookup_fails(monkeypatch):
    _fake_pyrfc(monkeypatch, _all_tables(LFA1=ABAPApplicationError("NOT_AUTHORIZED")))

    record = fetch_po_record(CONFIG, "4500000123")

    assert "vendor_name" not in record
    assert record["vendor_code"] == "89234"


def test_fetch_falls_back_to_payment_terms_key_without_days(monkeypatch):
    header = {**EKKO_ROW, "ZBD1T": "0", "ZBD2T": "0"}
    _fake_pyrfc(monkeypatch, _all_tables(EKKO=[header]))

    record = fetch_po_record(CONFIG, "4500000123")

    assert record["payment_terms"] == "Payment terms key 0002"


def test_fetch_leaves_out_initial_dates(monkeypatch):
    header = {**EKKO_ROW, "KDATB": "00000000", "KDATE": ""}
    _fake_pyrfc(monkeypatch, _all_tables(EKKO=[header]))

    record = fetch_po_record(CONFIG, "4500000123")

    assert "contract_period_start" not in record
    assert "contract_period_end" not in record


def test_fetch_raises_not_found_for_unknown_po(monkeypatch):
    _fake_pyrfc(monkeypatch, _all_tables(EKKO=[]))

    with pytest.raises(PurchaseOrderNotFoundError, match="4500000999"):
        fetch_po_record(CONFIG, "4500000999")


def test_fetch_raises_not_found_for_blank_po_number():
    with pytest.raises(PurchaseOrderNotFoundError):
        fetch_po_record(CONFIG, "   ")


def test_fetch_raises_auth_error_on_logon_failure(monkeypatch):
    _fake_pyrfc(monkeypatch, {}, connect_error=LogonError("Name or password is incorrect"))

    with pytest.raises(SapAuthError, match="password is incorrect"):
        fetch_po_record(CONFIG, "4500000123")


def test_fetch_raises_api_error_when_sap_is_unreachable(monkeypatch):
    _fake_pyrfc(monkeypatch, {}, connect_error=CommunicationError("partner not reached"))

    with pytest.raises(SapApiError, match="Could not reach SAP: partner not reached"):
        fetch_po_record(CONFIG, "4500000123")


def test_fetch_raises_api_error_when_table_read_is_not_authorized(monkeypatch):
    _fake_pyrfc(monkeypatch, _all_tables(EKKO=ABAPApplicationError("NOT_AUTHORIZED")))

    with pytest.raises(SapApiError, match="NOT_AUTHORIZED"):
        fetch_po_record(CONFIG, "4500000123")


def test_fetch_raises_api_error_when_pyrfc_is_missing(monkeypatch):
    monkeypatch.setitem(sys.modules, "pyrfc", None)

    with pytest.raises(SapApiError, match="not available"):
        fetch_po_record(CONFIG, "4500000123")
