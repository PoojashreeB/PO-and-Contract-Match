import pytest
from pydantic import ValidationError
from schemas.po_schema import PODetails
from schemas.contract_schema import ContractDetails
from schemas.discrepancy_schema import DiscrepancyItem, ValidationReport


def _po_data():
    return {
        "po_number": "CC-PO-2025-001234",
        "po_date": "2025-08-15",
        "contract_period_start": "2025-09-01",
        "contract_period_end": "2026-08-31",
        "contract_price": "INR 45,00,000",
        "payment_terms": "Net 30 days",
        "liquidated_damage": "0.5% per week, max 5%",
        "pricing_info": "Fixed price",
        "contact_info": "procurement@clientco.com",
        "vendor_name": "ABC Engineering Services Pvt. Ltd.",
        "vendor_code": "VENDOR-0089234",
        "confidence_notes": "",
    }


def _contract_data():
    return {
        "contract_agreement_number": "CC-CONT-2025-001234",
        "validity_start": "2025-09-01",
        "validity_end": "2026-08-31",
        "owner": "ClientCo Limited",
        "service_provider": "ABC Engineering Services Pvt. Ltd.",
        "payment_terms": "Payment within 30 days of invoice",
        "liquidated_damage": "0.5% per week, max 10%",
        "pricing_info": "INR 45,50,000 fixed",
        "bank_guarantee": "10% of contract value",
        "penalty_info": "2% for quality non-conformance",
        "confidence_notes": "",
    }


def test_po_details_valid():
    po = PODetails(**_po_data())
    assert po.po_number == "CC-PO-2025-001234"
    assert po.contract_price == "INR 45,00,000"


def test_po_details_missing_field_raises():
    data = _po_data()
    del data["po_number"]
    with pytest.raises(ValidationError):
        PODetails(**data)


def test_contract_details_valid():
    contract = ContractDetails(**_contract_data())
    assert contract.contract_agreement_number == "CC-CONT-2025-001234"
    assert contract.bank_guarantee == "10% of contract value"


def test_contract_details_missing_field_raises():
    data = _contract_data()
    del data["owner"]
    with pytest.raises(ValidationError):
        ContractDetails(**data)


def test_discrepancy_item_valid():
    item = DiscrepancyItem(
        field="contract_price",
        source_a="INR 45,00,000",
        source_b="INR 45,50,000",
        severity="major",
        note="Price differs by INR 50,000",
    )
    assert item.severity == "major"


def test_discrepancy_item_invalid_severity_raises():
    with pytest.raises(ValidationError):
        DiscrepancyItem(
            field="price",
            source_a="A",
            source_b="B",
            severity="critical",
            note="test",
        )


def test_validation_report_valid():
    report = ValidationReport(
        validation_type="PO_vs_SAP",
        summary="One major discrepancy found.",
        discrepancies=[
            DiscrepancyItem(
                field="contract_price",
                source_a="INR 45,00,000",
                source_b="INR 45,50,000",
                severity="major",
                note="Price differs",
            )
        ],
        overall_status="FAIL",
    )
    assert report.overall_status == "FAIL"
    assert len(report.discrepancies) == 1


def test_validation_report_invalid_type_raises():
    with pytest.raises(ValidationError):
        ValidationReport(
            validation_type="PO_vs_VIM",
            summary="test",
            discrepancies=[],
            overall_status="PASS",
        )


def test_validation_report_invalid_status_raises():
    with pytest.raises(ValidationError):
        ValidationReport(
            validation_type="PO_vs_SAP",
            summary="test",
            discrepancies=[],
            overall_status="OK",
        )
