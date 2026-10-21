from pydantic import BaseModel


class PODetails(BaseModel):
    po_number: str
    po_date: str
    contract_period_start: str
    contract_period_end: str
    contract_price: str
    payment_terms: str
    liquidated_damage: str
    pricing_info: str
    contact_info: str
    vendor_name: str
    vendor_code: str
    confidence_notes: str
