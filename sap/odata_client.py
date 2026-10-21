import re
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

import httpx

from schemas.sap_schema import SapConfig

PO_SERVICE_PATH = "/sap/opu/odata/sap/API_PURCHASEORDER_PROCESS_SRV"
BP_SERVICE_PATH = "/sap/opu/odata/sap/API_BUSINESS_PARTNER"

_ODATA_DATE = re.compile(r"/Date\((-?\d+)(?:[+-]\d+)?\)/")


class SapAuthError(Exception):
    pass


class PurchaseOrderNotFoundError(Exception):
    pass


class SapApiError(Exception):
    pass


def _odata_key(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def _parse_odata_date(value: str | None) -> str:
    if not value:
        return ""
    match = _ODATA_DATE.fullmatch(value)
    if not match:
        return value
    millis = int(match.group(1))
    return datetime.fromtimestamp(millis / 1000, tz=timezone.utc).date().isoformat()


def _to_decimal(value: str | None, default: Decimal) -> Decimal:
    try:
        return Decimal(value) if value not in (None, "") else default
    except InvalidOperation:
        return default


def _total_net_value(items: list[dict]) -> Decimal:
    total = Decimal(0)
    for item in items:
        if item.get("PurchasingDocumentDeletionCode"):
            continue
        price = _to_decimal(item.get("NetPriceAmount"), Decimal(0))
        quantity = _to_decimal(item.get("OrderQuantity"), Decimal(0))
        price_unit = _to_decimal(item.get("NetPriceQuantity"), Decimal(1)) or Decimal(1)
        total += price * quantity / price_unit
    return total


def _payment_terms(header: dict) -> str:
    net_days = _to_decimal(header.get("NetPaymentDays"), Decimal(0))
    if net_days:
        return f"Net {int(net_days)} days"
    code = header.get("PaymentTerms") or ""
    return f"Payment terms key {code}" if code else ""


def _map_purchase_order(header: dict, vendor_name: str) -> dict[str, str]:
    items = header.get("to_PurchaseOrderItem", {}).get("results", [])
    currency = header.get("DocumentCurrency") or ""
    record = {
        "po_number": header.get("PurchaseOrder") or "",
        "po_date": _parse_odata_date(header.get("PurchaseOrderDate")),
        "contract_period_start": _parse_odata_date(header.get("ValidityStartDate")),
        "contract_period_end": _parse_odata_date(header.get("ValidityEndDate")),
        "contract_price": f"{currency} {_total_net_value(items):,.2f}".strip() if items else "",
        "payment_terms": _payment_terms(header),
        "vendor_name": vendor_name,
        "vendor_code": header.get("Supplier") or "",
    }
    return {key: value for key, value in record.items() if value}


def _check_response(response: httpx.Response, what: str) -> None:
    if response.status_code == 401:
        raise SapAuthError("SAP rejected the username or password")
    if response.status_code != 200:
        raise SapApiError(f"SAP returned an error {what} (status {response.status_code})")


def _fetch_vendor_name(client: httpx.Client, supplier: str) -> str:
    # Best effort: the Business Partner API may not be activated on every system.
    if not supplier:
        return ""
    try:
        response = client.get(
            f"{BP_SERVICE_PATH}/A_Supplier({_odata_key(supplier)})",
            params={"$select": "SupplierName"},
        )
    except httpx.HTTPError:
        return ""
    if response.status_code != 200:
        return ""
    try:
        return response.json().get("d", {}).get("SupplierName") or ""
    except ValueError:
        return ""


def fetch_po_record(config: SapConfig, po_number: str) -> dict[str, str]:
    po_number = po_number.strip()
    if not po_number:
        raise PurchaseOrderNotFoundError("A PO number is required")

    try:
        with httpx.Client(
            base_url=config.base_url.rstrip("/"),
            auth=(config.username, config.password),
            params={"sap-client": config.client, "$format": "json"},
            headers={"Accept": "application/json"},
            verify=config.verify_tls,
            timeout=30.0,
        ) as client:
            response = client.get(
                f"{PO_SERVICE_PATH}/A_PurchaseOrder({_odata_key(po_number)})",
                params={"$expand": "to_PurchaseOrderItem"},
            )
            if response.status_code == 404:
                raise PurchaseOrderNotFoundError(f"PO {po_number} was not found in SAP")
            _check_response(response, "reading the purchase order")

            header = response.json().get("d", {})
            vendor_name = _fetch_vendor_name(client, header.get("Supplier") or "")
    except httpx.HTTPError as error:
        raise SapApiError(f"Could not reach SAP: {error}") from error
    except ValueError as error:
        raise SapApiError("SAP returned a response that is not JSON") from error

    return _map_purchase_order(header, vendor_name)
