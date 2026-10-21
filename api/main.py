import base64
import json
import logging
import os
import shutil
import tempfile
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

load_dotenv()

from api.auth import require_api_key
from crews.extraction_crew import run_extraction_crew
from crews.validation_crew import run_validation_crew
from outlook.config_store import load_config as load_outlook_config
from outlook.config_store import save_config as save_outlook_config
from outlook.graph_client import (
    GraphApiError,
    MissingAttachmentError,
    NoMatchingEmailError,
    OutlookAuthError,
    fetch_po_and_contract_attachments,
)
from sap.config_store import load_config as load_sap_config
from sap.config_store import save_config as save_sap_config
from sap.rfc_client import (
    PurchaseOrderNotFoundError,
    SapApiError,
    SapAuthError,
    fetch_po_record,
)
from schemas.discrepancy_schema import ValidationReport
from schemas.outlook_schema import OutlookConfig
from schemas.sap_schema import SapConfig
from utils.report_writer import write_report

logger = logging.getLogger(__name__)

app = FastAPI(title="PO and Contract Match API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ.get("FRONTEND_ORIGIN", "http://localhost:5173")],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-API-Key"],
)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    return JSONResponse(status_code=400, content={"detail": exc.errors()})


class ValidateResponse(BaseModel):
    sap_validation: ValidationReport
    contract_validation: ValidationReport
    report_pdf_base64: str


@app.post(
    "/validate",
    response_model=ValidateResponse,
    dependencies=[Depends(require_api_key)],
)
def validate(
    po_pdf: UploadFile = File(...),
    contract_pdf: UploadFile = File(...),
    sap_record: str = Form(...),
) -> ValidateResponse:
    try:
        sap_record_dict = json.loads(sap_record)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="sap_record must be valid JSON")
    if not isinstance(sap_record_dict, dict):
        raise HTTPException(status_code=400, detail="sap_record must be a JSON object")

    temp_dir = Path(tempfile.mkdtemp(prefix="po_contract_match_"))
    try:
        po_path = temp_dir / "po.pdf"
        contract_path = temp_dir / "contract.pdf"
        po_path.write_bytes(po_pdf.file.read())
        contract_path.write_bytes(contract_pdf.file.read())

        try:
            po_details, contract_details = run_extraction_crew(str(po_path), str(contract_path))
            sap_report, contract_report = run_validation_crew(
                po_details, contract_details, sap_record_dict
            )
            report_json_path = write_report(sap_report, contract_report)
        except Exception:
            logger.exception("Pipeline failed while processing /validate request")
            raise HTTPException(status_code=500, detail="Validation pipeline failed")

        pdf_path = report_json_path.with_suffix(".pdf")
        pdf_base64 = base64.b64encode(pdf_path.read_bytes()).decode("ascii")

        return ValidateResponse(
            sap_validation=sap_report,
            contract_validation=contract_report,
            report_pdf_base64=pdf_base64,
        )
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


class OutlookConfigResponse(BaseModel):
    tenant_id: str
    client_id: str
    mailbox: str
    subject_filter: str
    client_secret_set: bool


class OutlookFetchResponse(BaseModel):
    po_pdf_base64: str
    contract_pdf_base64: str


def _to_outlook_config_response(config: OutlookConfig) -> OutlookConfigResponse:
    return OutlookConfigResponse(
        tenant_id=config.tenant_id,
        client_id=config.client_id,
        mailbox=config.mailbox,
        subject_filter=config.subject_filter,
        client_secret_set=True,
    )


@app.get(
    "/outlook/config",
    response_model=OutlookConfigResponse,
    dependencies=[Depends(require_api_key)],
)
def get_outlook_config() -> OutlookConfigResponse:
    config = load_outlook_config()
    if config is None:
        raise HTTPException(status_code=404, detail="Outlook is not configured yet")
    return _to_outlook_config_response(config)


@app.post(
    "/outlook/config",
    response_model=OutlookConfigResponse,
    dependencies=[Depends(require_api_key)],
)
def post_outlook_config(config: OutlookConfig) -> OutlookConfigResponse:
    save_outlook_config(config)
    return _to_outlook_config_response(config)


@app.post(
    "/outlook/fetch",
    response_model=OutlookFetchResponse,
    dependencies=[Depends(require_api_key)],
)
def fetch_from_outlook() -> OutlookFetchResponse:
    config = load_outlook_config()
    if config is None:
        raise HTTPException(status_code=404, detail="Outlook is not configured yet")

    try:
        po_bytes, contract_bytes = fetch_po_and_contract_attachments(config)
    except OutlookAuthError as error:
        raise HTTPException(status_code=401, detail=f"Outlook authentication failed: {error}")
    except NoMatchingEmailError as error:
        raise HTTPException(status_code=404, detail=str(error))
    except MissingAttachmentError as error:
        raise HTTPException(status_code=422, detail=str(error))
    except GraphApiError as error:
        raise HTTPException(status_code=502, detail=str(error))

    return OutlookFetchResponse(
        po_pdf_base64=base64.b64encode(po_bytes).decode("ascii"),
        contract_pdf_base64=base64.b64encode(contract_bytes).decode("ascii"),
    )


class SapConfigResponse(BaseModel):
    ashost: str
    sysnr: str
    client: str
    username: str
    gwhost: str
    gwserv: str
    password_set: bool


class SapPoRecordRequest(BaseModel):
    po_number: str


def _to_sap_config_response(config: SapConfig) -> SapConfigResponse:
    return SapConfigResponse(
        ashost=config.ashost,
        sysnr=config.sysnr,
        client=config.client,
        username=config.username,
        gwhost=config.gwhost,
        gwserv=config.gwserv,
        password_set=True,
    )


@app.get(
    "/sap/config",
    response_model=SapConfigResponse,
    dependencies=[Depends(require_api_key)],
)
def get_sap_config() -> SapConfigResponse:
    config = load_sap_config()
    if config is None:
        raise HTTPException(status_code=404, detail="SAP is not configured yet")
    return _to_sap_config_response(config)


@app.post(
    "/sap/config",
    response_model=SapConfigResponse,
    dependencies=[Depends(require_api_key)],
)
def post_sap_config(config: SapConfig) -> SapConfigResponse:
    save_sap_config(config)
    return _to_sap_config_response(config)


@app.post(
    "/sap/po-record",
    response_model=dict[str, str],
    dependencies=[Depends(require_api_key)],
)
def fetch_sap_po_record(request: SapPoRecordRequest) -> dict[str, str]:
    config = load_sap_config()
    if config is None:
        raise HTTPException(status_code=404, detail="SAP is not configured yet")

    try:
        return fetch_po_record(config, request.po_number)
    except SapAuthError as error:
        raise HTTPException(status_code=401, detail=f"SAP authentication failed: {error}")
    except PurchaseOrderNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error))
    except SapApiError as error:
        raise HTTPException(status_code=502, detail=str(error))
