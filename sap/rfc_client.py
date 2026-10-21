import os
from decimal import Decimal, InvalidOperation

from schemas.sap_schema import SapConfig


class SapAuthError(Exception):
    pass


class PurchaseOrderNotFoundError(Exception):
    pass


class SapApiError(Exception):
    pass


def _load_pyrfc():
    # Imported lazily: pyrfc needs the SAP NW RFC SDK, which not every
    # environment (CI, tests) has installed.
    sdk_home = os.environ.get("SAPNWRFC_HOME")
    if sdk_home:
        # The SDK loads its ICU libraries via PATH; without them the
        # connection hangs instead of failing.
        sdk_lib = os.path.join(sdk_home, "lib")
        if sdk_lib not in os.environ.get("PATH", "").split(os.pathsep):
            os.environ["PATH"] = sdk_lib + os.pathsep + os.environ.get("PATH", "")
    try:
        import pyrfc
    except (ImportError, OSError) as error:
        raise SapApiError(
            "SAP RFC is not available on this server: install pyrfc and set SAPNWRFC_HOME"
        ) from error
    return pyrfc


def _error_message(error: Exception) -> str:
    return getattr(error, "message", "") or str(error)


def _alpha_in(value: str, length: int) -> str:
    return value.zfill(length) if value.isdigit() else value


def _alpha_out(value: str) -> str:
    return value.lstrip("0") or value if value.isdigit() else value


def _quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def _format_date(value: str) -> str:
    if not value or set(value) == {"0"}:
        return ""
    if len(value) == 8 and value.isdigit():
        return f"{value[:4]}-{value[4:6]}-{value[6:]}"
    return value


def _to_decimal(value: str) -> Decimal:
    # SAP renders negative numbers with a trailing minus, e.g. "12.50-".
    value = value.strip()
    if value.endswith("-"):
        value = "-" + value[:-1]
    try:
        return Decimal(value) if value else Decimal(0)
    except InvalidOperation:
        return Decimal(0)


def _read_table(connection, table: str, fields: list[str], where: str) -> list[dict[str, str]]:
    # RFC_READ_TABLE returns every field as text, which sidesteps pyrfc's
    # number conversion (it fails on some BAPI_PO_GETDETAIL1 header values).
    result = connection.call(
        "RFC_READ_TABLE",
        QUERY_TABLE=table,
        DELIMITER="|",
        OPTIONS=[{"TEXT": where}],
        FIELDS=[{"FIELDNAME": field} for field in fields],
    )
    return [
        dict(zip(fields, (value.strip() for value in row["WA"].split("|"))))
        for row in result.get("DATA", [])
    ]


def _payment_terms(header: dict[str, str]) -> str:
    net_days = max(_to_decimal(header.get(field, "")) for field in ("ZBD1T", "ZBD2T", "ZBD3T"))
    if net_days:
        return f"Net {int(net_days)} days"
    code = header.get("ZTERM", "")
    return f"Payment terms key {code}" if code else ""


def _map_purchase_order(
    header: dict[str, str], items: list[dict[str, str]], vendor_name: str
) -> dict[str, str]:
    active_items = [item for item in items if not item.get("LOEKZ")]
    total = sum((_to_decimal(item.get("NETWR", "")) for item in active_items), Decimal(0))
    currency = header.get("WAERS", "")
    record = {
        "po_number": header.get("EBELN", ""),
        "po_date": _format_date(header.get("BEDAT", "")),
        "contract_period_start": _format_date(header.get("KDATB", "")),
        "contract_period_end": _format_date(header.get("KDATE", "")),
        "contract_price": f"{currency} {total:,.2f}".strip() if active_items else "",
        "payment_terms": _payment_terms(header),
        "vendor_name": vendor_name,
        "vendor_code": _alpha_out(header.get("LIFNR", "")),
    }
    return {key: value for key, value in record.items() if value}


def _fetch_vendor_name(connection, pyrfc, vendor: str) -> str:
    # Best effort: a missing vendor name shouldn't fail the whole lookup.
    if not vendor:
        return ""
    try:
        rows = _read_table(connection, "LFA1", ["NAME1"], f"LIFNR = {_quote(vendor)}")
    except pyrfc.RFCError:
        return ""
    return rows[0]["NAME1"] if rows else ""


def _connection_params(config: SapConfig) -> dict[str, str]:
    params = {
        "ashost": config.ashost,
        "sysnr": config.sysnr,
        "client": config.client,
        "user": config.username,
        "passwd": config.password,
    }
    if config.gwhost:
        params["gwhost"] = config.gwhost
    if config.gwserv:
        params["gwserv"] = config.gwserv
    return params


def fetch_po_record(config: SapConfig, po_number: str) -> dict[str, str]:
    po_number = po_number.strip()
    if not po_number:
        raise PurchaseOrderNotFoundError("A PO number is required")

    pyrfc = _load_pyrfc()
    po_key = _quote(_alpha_in(po_number, 10))
    try:
        with pyrfc.Connection(**_connection_params(config)) as connection:
            headers = _read_table(
                connection,
                "EKKO",
                ["EBELN", "BEDAT", "LIFNR", "ZTERM", "ZBD1T", "ZBD2T", "ZBD3T", "WAERS", "KDATB", "KDATE"],
                f"EBELN = {po_key}",
            )
            if not headers:
                raise PurchaseOrderNotFoundError(f"PO {po_number} was not found in SAP")
            items = _read_table(connection, "EKPO", ["EBELP", "NETWR", "LOEKZ"], f"EBELN = {po_key}")
            vendor_name = _fetch_vendor_name(connection, pyrfc, headers[0].get("LIFNR", ""))
    except pyrfc.LogonError as error:
        raise SapAuthError(_error_message(error)) from error
    except pyrfc.CommunicationError as error:
        raise SapApiError(f"Could not reach SAP: {_error_message(error)}") from error
    except pyrfc.RFCError as error:
        raise SapApiError(f"SAP returned an error: {_error_message(error)}") from error

    return _map_purchase_order(headers[0], items, vendor_name)
