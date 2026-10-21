from crewai import Crew, Task, Process

from agents.po_extractor import make_po_extractor
from agents.contract_extractor import make_contract_extractor
from schemas.po_schema import PODetails
from schemas.contract_schema import ContractDetails


def run_extraction_crew(po_path: str, contract_path: str) -> tuple[PODetails, ContractDetails]:
    po_agent = make_po_extractor(po_path)
    contract_agent = make_contract_extractor(contract_path)

    po_task = Task(
        description=(
            "Use the PDF Reader tool to read the Purchase Order document. "
            "Extract the following fields exactly as they appear: "
            "po_number, po_date, contract_period_start, contract_period_end, "
            "contract_price, payment_terms, liquidated_damage, pricing_info, contact_info, "
            "vendor_name, vendor_code. "
            "Record any field you cannot locate clearly in confidence_notes. "
            "Return a JSON object matching the PODetails schema exactly."
        ),
        expected_output=(
            "A JSON object with keys: po_number, po_date, contract_period_start, "
            "contract_period_end, contract_price, payment_terms, liquidated_damage, "
            "pricing_info, contact_info, vendor_name, vendor_code, confidence_notes."
        ),
        agent=po_agent,
        output_pydantic=PODetails,
    )

    contract_task = Task(
        description=(
            "Use the PDF Reader tool to read the Contract document. "
            "Extract the following fields from the contract clauses: "
            "contract_agreement_number, validity_start, validity_end, owner, "
            "service_provider, payment_terms, liquidated_damage, pricing_info, "
            "bank_guarantee, penalty_info. "
            "Record any field you cannot locate clearly in confidence_notes. "
            "Return a JSON object matching the ContractDetails schema exactly."
        ),
        expected_output=(
            "A JSON object with keys: contract_agreement_number, validity_start, "
            "validity_end, owner, service_provider, payment_terms, liquidated_damage, "
            "pricing_info, bank_guarantee, penalty_info, confidence_notes."
        ),
        agent=contract_agent,
        output_pydantic=ContractDetails,
    )

    crew = Crew(
        agents=[po_agent, contract_agent],
        tasks=[po_task, contract_task],
        process=Process.sequential,
        verbose=True,
    )

    crew.kickoff()

    po_details: PODetails = po_task.output.pydantic
    contract_details: ContractDetails = contract_task.output.pydantic

    return po_details, contract_details
