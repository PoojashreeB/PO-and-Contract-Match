"""Writes a PO PDF and a Contract PDF for a document that exists in SAP, so
the full validation can run against a live "Fetch from SAP" record.

Usage: python -m scripts.generate_sap_samples <PO number>

Header values come from sap.rfc_client.fetch_po_record (the same record the
API returns); line items, delivery dates and the vendor address are read
from EKPO/EKET/LFA1. Both documents agree with SAP and with each other, so a
run should pass. Standard POs have no validity period in SAP, so their
documents show the scheduled delivery date instead of inventing one.
"""
import sys
from datetime import date
from pathlib import Path

from fpdf import FPDF

from sap.config_store import load_config
from sap.rfc_client import _alpha_in, _connection_params, _load_pyrfc, _quote, _read_table, fetch_po_record

INPUT_DIR = Path(__file__).parent.parent / "input"

LIQUIDATED_DAMAGE = "0.5% per week of delay, maximum 5% of contract value"


def _display_date(iso: str) -> str:
    return date.fromisoformat(iso).strftime("%d-%b-%Y") if iso else ""


def _read_details(po_number: str) -> tuple[list[dict[str, str]], dict[str, str], str]:
    pyrfc = _load_pyrfc()
    po_key = _quote(_alpha_in(po_number, 10))
    with pyrfc.Connection(**_connection_params(load_config())) as connection:
        items = _read_table(
            connection, "EKPO", ["EBELP", "TXZ01", "KTMNG", "MENGE", "MEINS", "NETPR", "LOEKZ"], f"EBELN = {po_key}"
        )
        lifnr = _read_table(connection, "EKKO", ["LIFNR"], f"EBELN = {po_key}")[0]["LIFNR"]
        vendor = _read_table(
            connection, "LFA1", ["STRAS", "ORT01", "REGIO", "PSTLZ", "LAND1"], f"LIFNR = {_quote(lifnr)}"
        )
        schedule = _read_table(connection, "EKET", ["EINDT"], f"EBELN = {po_key}")
    delivery_dates = sorted(row["EINDT"] for row in schedule if row["EINDT"].strip("0"))
    delivery = date(int(delivery_dates[-1][:4]), int(delivery_dates[-1][4:6]), int(delivery_dates[-1][6:])).isoformat() if delivery_dates else ""
    return [item for item in items if not item["LOEKZ"]], (vendor[0] if vendor else {}), delivery


def _vendor_address(vendor: dict[str, str]) -> str:
    city = " ".join(part for part in (vendor.get("ORT01", ""), vendor.get("REGIO", ""), vendor.get("PSTLZ", "")) if part)
    return ", ".join(part for part in (vendor.get("STRAS", ""), city, vendor.get("LAND1", "")) if part)


def _item_lines(items: list[dict[str, str]], currency: str) -> list[str]:
    lines = []
    for item in items:
        # Agreements carry a target quantity (KTMNG); standard POs leave it 0.
        quantity = float(item["KTMNG"] or 0) or float(item["MENGE"] or 0)
        lines.append(
            f"Item {item['EBELP'].lstrip('0')}: {item['TXZ01']} - {quantity:g} {item['MEINS']} "
            f"at {currency} {float(item['NETPR'] or 0):,.2f} per {item['MEINS']}"
        )
    return lines


def _has_period(record: dict[str, str]) -> bool:
    return bool(record.get("contract_period_start") and record.get("contract_period_end"))


def create_po(
    record: dict[str, str], items: list[dict[str, str]], address: str, currency: str, delivery: str
) -> Path:
    pdf = FPDF()
    pdf.add_page()

    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, "PURCHASE ORDER", ln=True, align="C")
    pdf.ln(5)

    if _has_period(record):
        period = f"{_display_date(record['contract_period_start'])} to {_display_date(record['contract_period_end'])}"
        schedule = ("Contract Period:", period)
    else:
        schedule = ("Delivery Date:", _display_date(delivery))
    fields = [
        ("PO Number:", record["po_number"]),
        ("PO Date:", _display_date(record.get("po_date", ""))),
        schedule,
        ("Contract Price:", record.get("contract_price", "")),
        ("Payment Terms:", record.get("payment_terms", "")),
        ("Liquidated Damage:", LIQUIDATED_DAMAGE),
        ("Pricing:", "Fixed unit rate, no escalation applicable"),
        ("Vendor:", record.get("vendor_name", "")),
        ("Vendor Code:", record.get("vendor_code", "")),
        ("Vendor Address:", address),
    ]
    for label, value in fields:
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(65, 8, label)
        pdf.set_font("Helvetica", size=11)
        pdf.cell(0, 8, value, ln=True)

    pdf.ln(5)
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 8, "Line Items:", ln=True)
    pdf.set_font("Helvetica", size=10)
    for line in _item_lines(items, currency):
        pdf.multi_cell(0, 6, line)

    out = INPUT_DIR / f"sap_po_{record['po_number']}.pdf"
    pdf.output(str(out))
    print(f"Created: {out}")
    return out


def _long_date(iso: str) -> str:
    return date.fromisoformat(iso).strftime("%d %B %Y")


def create_contract(
    record: dict[str, str], items: list[dict[str, str]], address: str, currency: str, delivery: str
) -> Path:
    pdf = FPDF()
    pdf.add_page()

    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, "CONTRACT AGREEMENT", ln=True, align="C")
    pdf.ln(3)
    pdf.set_font("Helvetica", size=11)
    pdf.cell(0, 8, f"Contract Agreement No: {record['po_number']}", ln=True)
    pdf.ln(3)

    if _has_period(record):
        validity = (
            f"This contract shall remain valid from {_long_date(record['contract_period_start'])} to "
            f"{_long_date(record['contract_period_end'])}, unless terminated earlier in accordance with "
            "the provisions of this Agreement."
        )
    else:
        validity = (
            f"This contract governs Purchase Order {record['po_number']} and remains in force until "
            "the supply against it is complete"
            + (f", with delivery scheduled for {_long_date(delivery)}." if delivery else ".")
        )
    scope = "; ".join(_item_lines(items, currency))
    sections = [
        (
            "1. PARTIES",
            f"This Agreement is entered into between ClientCo Limited (hereinafter referred to as "
            f"'Owner') and {record.get('vendor_name', '')}, vendor code {record.get('vendor_code', '')}, "
            f"{address} (hereinafter referred to as 'Supplier').",
        ),
        ("2. CONTRACT VALIDITY", validity),
        (
            "3. CONTRACT VALUE & PRICING",
            f"The total contract value is {record.get('contract_price', '')}. Scope: {scope}. "
            "Unit rates are fixed and the Supplier shall not be entitled to any escalation "
            "in price during the contract period.",
        ),
        (
            "4. PAYMENT TERMS",
            f"{record.get('payment_terms', '')}, on receipt of a valid invoice.",
        ),
        (
            "5. LIQUIDATED DAMAGES",
            "In the event of delay in completion beyond the scheduled date, Liquidated Damages "
            "shall be levied at the rate of 0.5% (half percent) per week of delay, subject to a "
            "maximum of 5% (five percent) of the total contract value.",
        ),
    ]

    for heading, body in sections:
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 8, heading, ln=True)
        pdf.set_font("Helvetica", size=10)
        pdf.multi_cell(0, 6, body)
        pdf.ln(3)

    out = INPUT_DIR / f"sap_contract_{record['po_number']}.pdf"
    pdf.output(str(out))
    print(f"Created: {out}")
    return out


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Usage: python -m scripts.generate_sap_samples <PO number>")
    config = load_config()
    if config is None:
        sys.exit("SAP is not configured yet (config/sap_config.json)")
    record = fetch_po_record(config, sys.argv[1])
    items, vendor, delivery = _read_details(sys.argv[1])
    currency = record.get("contract_price", "").split(" ")[0]
    INPUT_DIR.mkdir(exist_ok=True)
    address = _vendor_address(vendor)
    create_po(record, items, address, currency, delivery)
    create_contract(record, items, address, currency, delivery)
    print("Done.")
