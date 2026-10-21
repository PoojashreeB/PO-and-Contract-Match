# PO and Contract Match — Architecture

**Project:** Automated PO and Contract validation for ClientCo Limited
**Stack:** Python · CrewAI · pdfplumber · Pydantic
**Scope:** Pure agentic pipeline — no UiPath integration in this build

---

## Overview

The system validates Purchase Orders against both the SAP PO record and the Contract copy. It is split into two sequential CrewAI crews connected by Pydantic-validated schemas. The LLM layer handles all extraction and comparison; deterministic Python handles file I/O, schema validation, and report generation.

---

## End-to-End Data Flow

```
input/po.pdf  ─────┐
                   ▼
           [Extraction Crew]
input/contract.pdf ┘
           │
           ├── PODetails (Pydantic)
           └── ContractDetails (Pydantic)
                   │
config/sap_po_record.json ──┐
                            ▼
                  [Validation Crew]
                            │
                  ├── ValidationReport: PO_vs_SAP
                  └── ValidationReport: PO_vs_Contract
                            │
                     [report_writer.py]
                            │
                  ├── output/report_<timestamp>.json
                  └── Console summary printed
```

---

## Project Structure

```
po-contract-match/
├── main.py                      # Entry point — hardcoded input paths, orchestrates both crews
├── requirements.txt
├── .env.example
│
├── input/                       # Drop PO PDF + Contract PDF here before running
│   └── .gitkeep
├── config/
│   └── sap_po_record.json       # Manually maintained SAP PO export (JSON)
├── output/                      # Runtime — JSON discrepancy reports saved here (gitignored)
│   └── .gitkeep
│
├── schemas/
│   ├── po_schema.py             # Pydantic model: extracted PO fields
│   ├── contract_schema.py       # Pydantic model: extracted Contract fields
│   └── discrepancy_schema.py    # Pydantic models: DiscrepancyItem + ValidationReport
│
├── tools/
│   └── pdf_reader.py            # pdfplumber wrapper as a CrewAI BaseTool
│
├── agents/
│   ├── po_extractor.py          # Extracts PO fields from PDF
│   ├── contract_extractor.py    # Extracts Contract fields from PDF
│   ├── po_sap_validator.py      # Compares PODetails vs SAP record
│   └── po_contract_validator.py # Compares PODetails vs ContractDetails
│
├── crews/
│   ├── extraction_crew.py       # Crew 1: POExtractor → ContractExtractor
│   └── validation_crew.py       # Crew 2: POvsSAPValidator → POvsContractValidator
│
├── utils/
│   ├── llm_factory.py           # Multi-LLM fallback: Claude → Gemini → OpenRouter
│   └── report_writer.py         # Merges ValidationReports → JSON file + console print
│
└── docs/
    └── ARCHITECTURE.md          # This file
```

---

## Crew 1 — Extraction Crew

**File:** `crews/extraction_crew.py`
**Process:** Sequential
**Agents:** `POExtractor` → `ContractExtractor`

Each agent is given a `PDFReaderTool` instantiated with its specific file path. Each task declares `output_pydantic` so CrewAI enforces the schema on the LLM response — the crew output is always a validated Pydantic object, never raw text.

### POExtractor Agent

| Property | Value |
|---|---|
| Tool | `PDFReaderTool(po_path)` |
| Output schema | `PODetails` |
| Instruction principle | Extract only what is explicitly stated; never infer missing values; flag ambiguity in `confidence_notes` |

**Fields extracted:**
- `po_number`, `po_date`
- `contract_period_start`, `contract_period_end`
- `contract_price`, `payment_terms`
- `liquidated_damage`, `pricing_info`, `contact_info`
- `confidence_notes` — agent flags anything uncertain

### ContractExtractor Agent

| Property | Value |
|---|---|
| Tool | `PDFReaderTool(contract_path)` |
|Output schema | `ContractDetails` |
| Instruction principle | Locate and interpret legal clauses in prose; extract only explicitly stated values |

**Fields extracted:**
- `contract_agreement_number`
- `validity_start`, `validity_end`
- `owner`, `service_provider`
- `payment_terms`, `liquidated_damage`, `pricing_info`
- `bank_guarantee`, `penalty_info`
- `confidence_notes`

---

## Crew 2 — Validation Crew

**File:** `crews/validation_crew.py`
**Process:** Sequential
**Agents:** `POvsSAPValidator` → `POvsContractValidator`

Validator agents receive no tools. The extracted Pydantic objects and the SAP JSON record are serialised to string and injected into each task's `description` field by `main.py`. Each task declares `output_pydantic=ValidationReport`.

### POvsSAPValidator Agent

Compares `PODetails` fields against the SAP PO record loaded from `config/sap_po_record.json`. Flags meaningful discrepancies — not strict string equality. Produces `ValidationReport(validation_type="PO_vs_SAP")`.

### POvsContractValidator Agent

The hardest reasoning step. Recognises semantic equivalence across differently-worded fields (e.g., "net 30" vs. "payment within 30 days") while still flagging genuine mismatches (price, dates, LD terms). Produces `ValidationReport(validation_type="PO_vs_Contract")`.

---

## Schemas

All cross-boundary data is Pydantic-validated. No raw LLM text ever reaches deterministic code.

### `PODetails`
```
po_number, po_date, contract_period_start, contract_period_end,
contract_price, payment_terms, liquidated_damage, pricing_info,
contact_info, confidence_notes
```

### `ContractDetails`
```
contract_agreement_number, validity_start, validity_end,
owner, service_provider, payment_terms, liquidated_damage,
pricing_info, bank_guarantee, penalty_info, confidence_notes
```

### `DiscrepancyItem`
```
field          — which field mismatched
source_a       — value from PO or SAP record
source_b       — value from Contract or SAP export
severity       — "match" | "minor" | "major"
note           — agent's plain-English explanation
```

### `ValidationReport`
```
validation_type  — "PO_vs_SAP" | "PO_vs_Contract"
summary          — human-readable paragraph
discrepancies    — list[DiscrepancyItem]
overall_status   — "PASS" | "PASS_WITH_WARNINGS" | "FAIL"
```

**Schema design decisions:**
- Monetary and date fields are `str`, not `float`/`date` — avoids LLM type-conversion errors; downstream can parse if needed
- `confidence_notes` on extraction schemas allows agents to flag ambiguity without failing the run
- `severity` on each discrepancy gives a triage signal without the agent making a business decision

---

## Tools

### `PDFReaderTool` (`tools/pdf_reader.py`)

CrewAI `BaseTool` wrapping `pdfplumber`. Instantiated once per file path. Returns the full text of the PDF as a string. Both extractor agents get their own instance — no shared state.

```python
class PDFReaderTool(BaseTool):
    name: str = "PDF Reader"
    description: str = "Reads a PDF file and returns its full text content"
    file_path: str

    def _run(self) -> str:
        with pdfplumber.open(self.file_path) as pdf:
            return "\n".join(page.extract_text() or "" for page in pdf.pages)
```

---

## Utils

### `llm_factory.py`

Multi-LLM fallback — same pattern as the repo's `hate-tweet-detector`:

```
ANTHROPIC_API_KEY  →  claude-sonnet-4-6
GEMINI_API_KEY     →  gemini/gemini-2.0-flash
OPENROUTER_API_KEY →  openrouter/openai/gpt-oss-120b:free
```

### `report_writer.py`

Accepts both `ValidationReport` objects. Writes a single merged JSON to `output/report_<timestamp>.json`. Prints a structured console summary grouped by validation type, listing each discrepancy with its severity and agent note.

---

## LLM & Agent Budget

- Extraction Crew: 2 LLM calls (one per agent)
- Validation Crew: 2 LLM calls (one per agent)
- **Total per run: 4 LLM calls**

Well within the 240K agent action budget specified in the ClientCo infrastructure allocation.

---

## Out of Scope (this build)

- UiPath integration
- SAP connectivity from the CLI (`main.py` still reads `config/sap_po_record.json`; the REST API can fetch the record live from S/4HANA via `POST /sap/po-record` — see `sap/odata_client.py`)
- CLI argument parsing (paths are hardcoded in `main.py`)
- Retry logic / error recovery
- Non-English documents
- Handwritten or scanned (non-typed) PDFs

---

## Key Invariants

1. Schemas are the only thing that crosses crew boundaries — never raw strings
2. Crews never import each other — `main.py` is the sole orchestrator
3. The SAP record is loaded once in `main.py` and passed as a plain dict
4. Agents are scoped narrowly: extractors extract, validators compare — no agent does both
5. The system's judgment stops at *extract → compare → summarize*; it never approves or resolves discrepancies
