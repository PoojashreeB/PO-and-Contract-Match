import httpx
import pytest

from sap.odata_client import (
    PurchaseOrderNotFoundError,
    SapApiError,
    SapAuthError,
    fetch_po_record,
)
from schemas.sap_schema import SapConfig

CONFIG = SapConfig(
    base_url="https://sap.example.com:44300/",
    client="100",
    username="TECH_USER",
    password="super-secret",
    verify_tls=False,
)

PO_HEADER = {
    "PurchaseOrder": "4500000123",
    "PurchaseOrderDate": "/Date(1755216000000)/",
    "ValidityStartDate": "/Date(1756684800000)/",
    "ValidityEndDate": "/Date(1788134400000)/",
    "DocumentCurrency": "INR",
    "PaymentTerms": "0001",
    "NetPaymentDays": "30",
    "Supplier": "89234",
    "to_PurchaseOrderItem": {
        "results": [
            {"NetPriceAmount": "4000000.00", "OrderQuantity": "1", "NetPriceQuantity": "1"},
            {"NetPriceAmount": "5000.00", "OrderQuantity": "100", "NetPriceQuantity": "1"},
            {
                "NetPriceAmount": "999.00",
                "OrderQuantity": "1",
                "NetPriceQuantity": "1",
                "PurchasingDocumentDeletionCode": "L",
            },
        ]
    },
}


def _patch_transport(monkeypatch, handler):
    real_client = httpx.Client

    def make_client(*args, **kwargs):
        return real_client(*args, transport=httpx.MockTransport(handler), **kwargs)

    monkeypatch.setattr("sap.odata_client.httpx.Client", make_client)


def _sap_handler(po_response: httpx.Response, supplier_response: httpx.Response | None = None):
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if "A_PurchaseOrder" in request.url.path:
            return po_response
        if supplier_response is None:
            return httpx.Response(404)
        return supplier_response

    return handler, requests


def test_fetch_maps_purchase_order_to_sap_record(monkeypatch):
    handler, requests = _sap_handler(
        httpx.Response(200, json={"d": PO_HEADER}),
        httpx.Response(200, json={"d": {"SupplierName": "ABC Engineering Services Pvt. Ltd."}}),
    )
    _patch_transport(monkeypatch, handler)

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
    po_request = requests[0]
    assert po_request.url.path == (
        "/sap/opu/odata/sap/API_PURCHASEORDER_PROCESS_SRV/A_PurchaseOrder('4500000123')"
    )
    assert po_request.url.params["sap-client"] == "100"
    assert po_request.url.params["$expand"] == "to_PurchaseOrderItem"
    assert po_request.headers["Authorization"].startswith("Basic ")


def test_fetch_leaves_out_vendor_name_when_business_partner_api_is_unavailable(monkeypatch):
    handler, _ = _sap_handler(httpx.Response(200, json={"d": PO_HEADER}))
    _patch_transport(monkeypatch, handler)

    record = fetch_po_record(CONFIG, "4500000123")

    assert "vendor_name" not in record
    assert record["vendor_code"] == "89234"


def test_fetch_falls_back_to_payment_terms_key_without_net_days(monkeypatch):
    header = {**PO_HEADER, "NetPaymentDays": "0"}
    handler, _ = _sap_handler(httpx.Response(200, json={"d": header}))
    _patch_transport(monkeypatch, handler)

    record = fetch_po_record(CONFIG, "4500000123")

    assert record["payment_terms"] == "Payment terms key 0001"


def test_fetch_escapes_quotes_in_po_number(monkeypatch):
    handler, requests = _sap_handler(httpx.Response(200, json={"d": PO_HEADER}))
    _patch_transport(monkeypatch, handler)

    fetch_po_record(CONFIG, "45'01")

    assert "A_PurchaseOrder('45''01')" in requests[0].url.path


def test_fetch_raises_not_found_for_unknown_po(monkeypatch):
    handler, _ = _sap_handler(httpx.Response(404, json={"error": {}}))
    _patch_transport(monkeypatch, handler)

    with pytest.raises(PurchaseOrderNotFoundError, match="4500000999"):
        fetch_po_record(CONFIG, "4500000999")


def test_fetch_raises_not_found_for_blank_po_number():
    with pytest.raises(PurchaseOrderNotFoundError):
        fetch_po_record(CONFIG, "   ")


def test_fetch_raises_auth_error_on_401(monkeypatch):
    handler, _ = _sap_handler(httpx.Response(401))
    _patch_transport(monkeypatch, handler)

    with pytest.raises(SapAuthError):
        fetch_po_record(CONFIG, "4500000123")


def test_fetch_raises_api_error_on_server_error(monkeypatch):
    handler, _ = _sap_handler(httpx.Response(500, text="boom"))
    _patch_transport(monkeypatch, handler)

    with pytest.raises(SapApiError, match="status 500"):
        fetch_po_record(CONFIG, "4500000123")


def test_fetch_raises_api_error_when_response_is_not_json(monkeypatch):
    handler, _ = _sap_handler(httpx.Response(200, text="<html>SAP logon</html>"))
    _patch_transport(monkeypatch, handler)

    with pytest.raises(SapApiError, match="not JSON"):
        fetch_po_record(CONFIG, "4500000123")


def test_fetch_raises_api_error_when_sap_is_unreachable(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused", request=request)

    _patch_transport(monkeypatch, handler)

    with pytest.raises(SapApiError, match="Could not reach SAP"):
        fetch_po_record(CONFIG, "4500000123")
