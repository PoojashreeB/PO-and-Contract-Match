from fpdf import FPDF, XPos, YPos
from pathlib import Path


INPUT_DIR = Path(__file__).parent.parent / "input"


def create_sample_po() -> None:
    pdf = FPDF()
    pdf.add_page()

    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, "PURCHASE ORDER", new_x=XPos.LMARGIN, new_y=YPos.NEXT, align="C")
    pdf.ln(5)

    pdf.set_font("Helvetica", size=11)
    fields = [
        ("PO Number:", "CC-PO-2025-001234"),
        ("PO Date:", "15-Aug-2025"),
        ("Contract Period:", "01-Sep-2025 to 31-Aug-2026"),
        ("Contract Price:", "INR 45,00,000 (Forty-Five Lakhs Only)"),
        ("Payment Terms:", "Net 30 days from date of invoice"),
        ("Liquidated Damage:", "0.5% per week of delay, maximum 5% of contract value"),
        ("Pricing:", "Fixed price contract, no escalation applicable"),
        ("Contact:", "procurement@clientco.com | +91-294-6604000"),
        ("Vendor:", "ABC Engineering Services Pvt. Ltd."),
        ("Vendor Code:", "VENDOR-0089234"),
        ("Vendor Address:", "Plot 12, Industrial Area, Rivertown - 500001"),
    ]
    for label, value in fields:
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(65, 8, label)
        pdf.set_font("Helvetica", size=11)
        pdf.cell(0, 8, value, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    pdf.ln(5)
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 8, "Scope of Work:", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("Helvetica", size=10)
    pdf.multi_cell(
        0, 6,
        "Supply, installation, testing and commissioning of electrical sub-station "
        "equipment at ClientCo Metal Smelter, Rivertown. The work includes all civil, "
        "structural, and electrical works as per technical specifications attached.",
    )

    out = INPUT_DIR / "sample_po.pdf"
    pdf.output(str(out))
    print(f"Created: {out}")


def create_sample_contract() -> None:
    pdf = FPDF()
    pdf.add_page()

    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, "CONTRACT AGREEMENT", new_x=XPos.LMARGIN, new_y=YPos.NEXT, align="C")
    pdf.ln(3)
    pdf.set_font("Helvetica", size=11)
    pdf.cell(0, 8, "Contract Agreement No: CC-CONT-2025-001234", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(3)

    sections = [
        (
            "1. PARTIES",
            "This Agreement is entered into between ClientCo Limited, a company "
            "incorporated under the Companies Act having its registered office at Corporate Tower, "
            "Rivertown - 500001 (hereinafter referred to as 'Owner') and ABC Engineering Services "
            "Pvt. Ltd., Plot 12, Industrial Area, Rivertown (hereinafter referred to as "
            "'Service Provider').",
        ),
        (
            "2. CONTRACT VALIDITY",
            "This contract shall remain valid from 01 September 2025 to 31 August 2026, "
            "unless terminated earlier in accordance with the provisions of this Agreement.",
        ),
        (
            "3. CONTRACT VALUE & PRICING",
            "The total contract value is INR 45,50,000 (Forty-Five Lakhs Fifty Thousand Only). "
            "This is a fixed-price contract. The Service Provider shall not be entitled to any "
            "escalation in price during the contract period.",
        ),
        (
            "4. PAYMENT TERMS",
            "Payment shall be made within 30 days of receipt of a valid invoice along with "
            "completion certificate from the Owner's representative. All payments shall be made "
            "by RTGS/NEFT to the bank account specified by the Service Provider.",
        ),
        (
            "5. LIQUIDATED DAMAGES",
            "In the event of delay in completion of work beyond the scheduled date, Liquidated "
            "Damages shall be levied at the rate of 0.5% (half percent) per week of delay or "
            "part thereof, subject to a maximum of 10% (ten percent) of the total contract value.",
        ),
        (
            "6. BANK GUARANTEE",
            "The Service Provider shall furnish a Performance Bank Guarantee equivalent to 10% "
            "of the contract value within 15 days of issuance of the Letter of Award. The Bank "
            "Guarantee shall remain valid until 90 days after the completion of the contract.",
        ),
        (
            "7. PENALTY CLAUSE",
            "In addition to Liquidated Damages, an additional penalty of 2% of the contract "
            "value shall be levied for quality non-conformances that result in rework or "
            "replacement of supplied equipment, as determined by the Owner's quality team.",
        ),
    ]

    for heading, body in sections:
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 8, heading, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.set_font("Helvetica", size=10)
        pdf.multi_cell(0, 6, body)
        pdf.ln(3)

    out = INPUT_DIR / "sample_contract.pdf"
    pdf.output(str(out))
    print(f"Created: {out}")


if __name__ == "__main__":
    INPUT_DIR.mkdir(exist_ok=True)
    create_sample_po()
    create_sample_contract()
    print("Done.")
