"""
Payslip PDF generation (reportlab). The same PDF is used for admin downloads
and as the optional Resend email attachment.
"""
from decimal import Decimal
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet

NAVY = colors.HexColor("#0e2a47")
HEADER_BLUE = colors.HexColor("#153e6b")
LIGHT_BLUE = colors.HexColor("#e9f0f8")
GREEN = colors.HexColor("#e8f5e9")
BORDER = colors.HexColor("#dce3ec")


def _fmt(value: Decimal | None) -> str:
    if value is None:
        return "—"
    return f"{value:,.2f}"


def build_payslip_pdf(
    *,
    worker_name: str,
    period_label: str,
    local_currency: str,
    base_currency: str,
    rows: list[tuple[str, str, str, str]],
) -> bytes:
    """rows: (item, local amount, base equivalent, meaning) — final row highlighted."""
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm, topMargin=18 * mm, bottomMargin=18 * mm,
        title=f"Payslip {period_label} — {worker_name}",
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("gs_title", parent=styles["Title"], textColor=NAVY, fontSize=16, spaceAfter=4)
    meaning_style = ParagraphStyle("meaning", parent=styles["Normal"], fontSize=8, textColor=colors.HexColor("#4a5568"))

    elements = [
        Paragraph("GlobalSolutions — Payslip", title_style),
        Spacer(1, 4 * mm),
    ]

    meta = Table(
        [["Selected Month", period_label], ["Employee", worker_name]],
        colWidths=[45 * mm, 100 * mm],
    )
    meta.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), LIGHT_BLUE),
        ("FONTNAME", (1, 0), (1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ]))
    elements += [meta, Spacer(1, 6 * mm)]

    table_data = [
        ["Earnings and deductions", "", "", ""],
        ["Item", local_currency, f"{base_currency} Equivalent", "Meaning"],
    ]
    for item, local, base, meaning in rows:
        table_data.append([item, local, base, Paragraph(meaning, meaning_style)])

    table = Table(table_data, colWidths=[42 * mm, 30 * mm, 34 * mm, 68 * mm], repeatRows=2)
    style = [
        ("SPAN", (0, 0), (-1, 0)),
        ("BACKGROUND", (0, 0), (-1, 0), HEADER_BLUE),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("ALIGN", (0, 0), (-1, 0), "CENTER"),
        ("FONTNAME", (0, 0), (-1, 1), "Helvetica-Bold"),
        ("BACKGROUND", (0, 1), (-1, 1), LIGHT_BLUE),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("ALIGN", (1, 1), (2, -1), "RIGHT"),
        ("FONTNAME", (0, 2), (0, -1), "Helvetica-Bold"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    # Highlight the final net row.
    last = len(table_data) - 1
    style += [
        ("BACKGROUND", (0, last), (-1, last), GREEN),
        ("FONTNAME", (0, last), (-1, last), "Helvetica-Bold"),
    ]
    table.setStyle(TableStyle(style))
    elements.append(table)

    doc.build(elements)
    return buf.getvalue()


def payslip_rows(summary) -> list[tuple[str, str, str, str]]:
    """Build the standard payslip rows from a PayrollWorkerSummary."""
    fx = summary.fx_rate

    def base_of(local: Decimal | None) -> str:
        if local is None or not fx or fx <= 0:
            return "—"
        return _fmt(Decimal(local) / Decimal(fx))

    return [
        ("Hours Logged", _fmt(summary.hours_logged), "", "Approved hours in the selected month."),
        ("Rate per Hour", _fmt(summary.rate_per_hour), base_of(summary.rate_per_hour), "Contract rate per approved hour."),
        ("Base Pay", _fmt(summary.base_pay), base_of(summary.base_pay), "Hours multiplied by approved rate."),
        ("Bonus", _fmt(summary.bonus), base_of(summary.bonus), "Any approved monthly bonus."),
        ("Gross Earned", _fmt(summary.gross_earned), base_of(summary.gross_earned), "Base pay plus bonus before deductions."),
        ("Transfer Cost Deduction", _fmt(summary.transfer_cost), base_of(summary.transfer_cost), "Allocated remittance and platform cost."),
        ("External Cost Deduction", _fmt(summary.external_cost), base_of(summary.external_cost), "Allocated external business cost applied to payroll."),
        ("Total Deductions", _fmt(summary.total_deductions), base_of(summary.total_deductions), "Transfer cost plus external cost."),
        ("Final Net Pay Due", _fmt(summary.final_net), base_of(summary.final_net), "Final amount payable after deductions."),
    ]
