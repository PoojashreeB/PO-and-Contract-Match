import base64
import json
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from api.main import app
from outlook.graph_client import (
    GraphApiError,
    MissingAttachmentError,
    NoMatchingEmailError,
    OutlookAuthError,
)
from schemas.contract_schema import ContractDetails
from schemas.discrepancy_schema import DiscrepancyItem, ValidationReport
from sap.odata_client import PurchaseOrderNotFoundError, SapApiError, SapAuthError
from schemas.outlook_schema import OutlookConfig
from schemas.po_schema import PODetails
from schemas.sap_schema import SapConfig

client = TestClient(app)

FAKE_PO = PODetails(
    po_number="CC-PO-2025-001234",
    po_date="2025-08-15",
    contract_period_start="2025-09-01",
    contract_period_end="2026-08-31",
    contract_price="INR 45,00,000",
    payment_terms="Net 30 days",
    liquidated_damage="0.5% per week, max 5%",
    pricing_info="Fixed price",
    contact_info="procurement@clientco.com",
    vendor_name="ABC Engineering Services Pvt. Ltd.",
    vendor_code="VENDOR-0089234",
    confidence_notes="",
)

FAKE_CONTRACT = ContractDetails(
    contract_agreement_number="CC-CONT-2025-001234",
    validity_start="2025-09-01",
    validity_end="2026-08-31",
    owner="ClientCo Limited",
    service_provider="ABC Engineering Services Pvt. Ltd.",
    payment_terms="Payment within 30 days of invoice",
    liquidated_damage="0.5% per week, max 10%",
    pricing_info="INR 45,50,000 fixed",
    bank_guarantee="10% of contract value",
    penalty_info="2% for quality non-conformance",
    confidence_notes="",
)

FAKE_SAP_REPORT = ValidationReport(
    validation_type="PO_vs_SAP",
    summary="No discrepancies found.",
    discrepancies=[
        DiscrepancyItem(
            field="contract_price",
            source_a="INR 45,00,000",
            source_b="INR 45,00,000",
            severity="match",
            note="Matches",
        )
    ],
    overall_status="PASS",
)

FAKE_CONTRACT_REPORT = ValidationReport(
    validation_type="PO_vs_Contract",
    summary="One major discrepancy found.",
    discrepancies=[
        DiscrepancyItem(
            field="contract_price",
            source_a="INR 45,00,000",
            source_b="INR 45,50,000",
            severity="major",
            note="Price differs by INR 50,000",
        )
    ],
    overall_status="FAIL",
)


@pytest.fixture(autouse=True)
def _set_api_key(monkeypatch):
    monkeypatch.setenv("API_KEY", "test-key")


def _upload_files():
    return {
        "po_pdf": ("po.pdf", b"%PDF-1.4 fake po content", "application/pdf"),
        "contract_pdf": ("contract.pdf", b"%PDF-1.4 fake contract content", "application/pdf"),
    }


@patch("api.main.run_validation_crew", return_value=(FAKE_SAP_REPORT, FAKE_CONTRACT_REPORT))
@patch("api.main.run_extraction_crew", return_value=(FAKE_PO, FAKE_CONTRACT))
def test_validate_happy_path(mock_extraction, mock_validation):
    response = client.post(
        "/validate",
        headers={"X-API-Key": "test-key"},
        files=_upload_files(),
        data={"sap_record": json.dumps({"po_number": "CC-PO-2025-001234"})},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["sap_validation"]["overall_status"] == "PASS"
    assert body["contract_validation"]["overall_status"] == "FAIL"
    assert base64.b64decode(body["report_pdf_base64"]).startswith(b"%PDF")


def test_validate_missing_api_key():
    response = client.post(
        "/validate",
        files=_upload_files(),
        data={"sap_record": "{}"},
    )
    assert response.status_code == 401


def test_validate_wrong_api_key():
    response = client.post(
        "/validate",
        headers={"X-API-Key": "wrong-key"},
        files=_upload_files(),
        data={"sap_record": "{}"},
    )
    assert response.status_code == 401


def test_validate_invalid_sap_record_json():
    response = client.post(
        "/validate",
        headers={"X-API-Key": "test-key"},
        files=_upload_files(),
        data={"sap_record": "not valid json"},
    )
    assert response.status_code == 400


def test_validate_sap_record_not_a_json_object():
    response = client.post(
        "/validate",
        headers={"X-API-Key": "test-key"},
        files=_upload_files(),
        data={"sap_record": "42"},
    )
    assert response.status_code == 400


def test_validate_missing_required_field():
    response = client.post(
        "/validate",
        headers={"X-API-Key": "test-key"},
        files={"po_pdf": ("po.pdf", b"%PDF-1.4 fake po content", "application/pdf")},
        data={"sap_record": "{}"},
    )
    assert response.status_code == 400


@patch("api.main.run_extraction_crew", side_effect=RuntimeError("LLM API error"))
def test_validate_pipeline_failure(mock_extraction):
    response = client.post(
        "/validate",
        headers={"X-API-Key": "test-key"},
        files=_upload_files(),
        data={"sap_record": "{}"},
    )
    assert response.status_code == 500


FAKE_OUTLOOK_CONFIG = OutlookConfig(
    tenant_id="tenant-123",
    client_id="client-abc",
    client_secret="super-secret",
    mailbox="procurement@clientco.com",
    subject_filter="PO and Contract",
)


def test_get_outlook_config_requires_api_key():
    response = client.get("/outlook/config")
    assert response.status_code == 401


@patch("api.main.load_outlook_config", return_value=None)
def test_get_outlook_config_returns_404_when_not_configured(mock_load):
    response = client.get("/outlook/config", headers={"X-API-Key": "test-key"})
    assert response.status_code == 404


@patch("api.main.load_outlook_config", return_value=FAKE_OUTLOOK_CONFIG)
def test_get_outlook_config_masks_the_secret(mock_load):
    response = client.get("/outlook/config", headers={"X-API-Key": "test-key"})
    assert response.status_code == 200
    body = response.json()
    assert body["client_secret_set"] is True
    assert "client_secret" not in body
    assert body["mailbox"] == "procurement@clientco.com"


@patch("api.main.save_outlook_config")
def test_post_outlook_config_saves_and_returns_masked_response(mock_save):
    response = client.post(
        "/outlook/config",
        headers={"X-API-Key": "test-key"},
        json={
            "tenant_id": "tenant-123",
            "client_id": "client-abc",
            "client_secret": "super-secret",
            "mailbox": "procurement@clientco.com",
            "subject_filter": "PO and Contract",
        },
    )
    assert response.status_code == 200
    assert "client_secret" not in response.json()
    mock_save.assert_called_once()
    saved_config = mock_save.call_args.args[0]
    assert saved_config.client_secret == "super-secret"


@patch("api.main.load_outlook_config", return_value=None)
def test_fetch_from_outlook_returns_404_when_not_configured(mock_load):
    response = client.post("/outlook/fetch", headers={"X-API-Key": "test-key"})
    assert response.status_code == 404


@patch("api.main.fetch_po_and_contract_attachments", return_value=(b"%PDF po", b"%PDF contract"))
@patch("api.main.load_outlook_config", return_value=FAKE_OUTLOOK_CONFIG)
def test_fetch_from_outlook_returns_base64_pdfs_on_success(mock_load, mock_fetch):
    response = client.post("/outlook/fetch", headers={"X-API-Key": "test-key"})
    assert response.status_code == 200
    body = response.json()
    assert base64.b64decode(body["po_pdf_base64"]) == b"%PDF po"
    assert base64.b64decode(body["contract_pdf_base64"]) == b"%PDF contract"


@patch("api.main.fetch_po_and_contract_attachments", side_effect=OutlookAuthError("bad secret"))
@patch("api.main.load_outlook_config", return_value=FAKE_OUTLOOK_CONFIG)
def test_fetch_from_outlook_maps_auth_error_to_401(mock_load, mock_fetch):
    response = client.post("/outlook/fetch", headers={"X-API-Key": "test-key"})
    assert response.status_code == 401


@patch("api.main.fetch_po_and_contract_attachments", side_effect=NoMatchingEmailError("no match"))
@patch("api.main.load_outlook_config", return_value=FAKE_OUTLOOK_CONFIG)
def test_fetch_from_outlook_maps_no_matching_email_to_404(mock_load, mock_fetch):
    response = client.post("/outlook/fetch", headers={"X-API-Key": "test-key"})
    assert response.status_code == 404


@patch("api.main.fetch_po_and_contract_attachments", side_effect=MissingAttachmentError("PO"))
@patch("api.main.load_outlook_config", return_value=FAKE_OUTLOOK_CONFIG)
def test_fetch_from_outlook_maps_missing_attachment_to_422(mock_load, mock_fetch):
    response = client.post("/outlook/fetch", headers={"X-API-Key": "test-key"})
    assert response.status_code == 422


@patch("api.main.fetch_po_and_contract_attachments", side_effect=GraphApiError("boom"))
@patch("api.main.load_outlook_config", return_value=FAKE_OUTLOOK_CONFIG)
def test_fetch_from_outlook_maps_graph_api_error_to_502(mock_load, mock_fetch):
    response = client.post("/outlook/fetch", headers={"X-API-Key": "test-key"})
    assert response.status_code == 502


FAKE_SAP_CONFIG = SapConfig(
    base_url="https://sap.example.com:44300",
    client="100",
    username="TECH_USER",
    password="super-secret",
)


def test_get_sap_config_requires_api_key():
    response = client.get("/sap/config")
    assert response.status_code == 401


@patch("api.main.load_sap_config", return_value=None)
def test_get_sap_config_returns_404_when_not_configured(mock_load):
    response = client.get("/sap/config", headers={"X-API-Key": "test-key"})
    assert response.status_code == 404


@patch("api.main.load_sap_config", return_value=FAKE_SAP_CONFIG)
def test_get_sap_config_masks_the_password(mock_load):
    response = client.get("/sap/config", headers={"X-API-Key": "test-key"})
    assert response.status_code == 200
    body = response.json()
    assert body["password_set"] is True
    assert "password" not in body
    assert body["username"] == "TECH_USER"
    assert body["verify_tls"] is True


@patch("api.main.save_sap_config")
def test_post_sap_config_saves_and_returns_masked_response(mock_save):
    response = client.post(
        "/sap/config",
        headers={"X-API-Key": "test-key"},
        json={
            "base_url": "https://sap.example.com:44300",
            "client": "100",
            "username": "TECH_USER",
            "password": "super-secret",
            "verify_tls": False,
        },
    )
    assert response.status_code == 200
    assert "password" not in response.json()
    saved_config = mock_save.call_args.args[0]
    assert saved_config.password == "super-secret"
    assert saved_config.verify_tls is False


@patch("api.main.load_sap_config", return_value=None)
def test_fetch_sap_po_record_returns_404_when_not_configured(mock_load):
    response = client.post(
        "/sap/po-record", headers={"X-API-Key": "test-key"}, json={"po_number": "4500000123"}
    )
    assert response.status_code == 404


@patch("api.main.fetch_po_record", return_value={"po_number": "4500000123", "vendor_code": "89234"})
@patch("api.main.load_sap_config", return_value=FAKE_SAP_CONFIG)
def test_fetch_sap_po_record_returns_record_on_success(mock_load, mock_fetch):
    response = client.post(
        "/sap/po-record", headers={"X-API-Key": "test-key"}, json={"po_number": "4500000123"}
    )
    assert response.status_code == 200
    assert response.json() == {"po_number": "4500000123", "vendor_code": "89234"}
    mock_fetch.assert_called_once_with(FAKE_SAP_CONFIG, "4500000123")


@pytest.mark.parametrize(
    "error, status_code",
    [
        (SapAuthError("bad password"), 401),
        (PurchaseOrderNotFoundError("PO 1 was not found in SAP"), 404),
        (SapApiError("boom"), 502),
    ],
)
@patch("api.main.load_sap_config", return_value=FAKE_SAP_CONFIG)
def test_fetch_sap_po_record_maps_errors(mock_load, error, status_code):
    with patch("api.main.fetch_po_record", side_effect=error):
        response = client.post(
            "/sap/po-record", headers={"X-API-Key": "test-key"}, json={"po_number": "1"}
        )
    assert response.status_code == status_code
