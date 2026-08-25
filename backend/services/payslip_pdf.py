"""
Payslip PDF generation (reportlab). The same PDF is used for admin downloads
and as the optional Resend email attachment.

PDFs are written to a local cache on Calculate / Generate so emailing and
preview do not have to rebuild them at send time.
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from io import BytesIO
from pathlib import Path
from typing import Any
from uuid import UUID

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet

# Print-friendly take on the platform palette (forest header, gold/emerald accents).
FOREST = colors.HexColor("#032F25")
HEADER_GREEN = colors.HexColor("#0A4D3A")
ROW_TINT = colors.HexColor("#E8F5F0")
GOLD = colors.HexColor("#D4AF37")
BORDER = colors.HexColor("#0A4D3A")
MUTED = colors.HexColor("#5F6F69")


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
    title_style = ParagraphStyle("gs_title", parent=styles["Title"], textColor=FOREST, fontSize=16, spaceAfter=4)
    meaning_style = ParagraphStyle("meaning", parent=styles["Normal"], fontSize=8, textColor=MUTED)

    gold_rule = Table([[""]], colWidths=[174 * mm], rowHeights=[2 * mm])
    gold_rule.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), GOLD),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    elements = [
        Paragraph("GlobalSolutions — Payslip", title_style),
        gold_rule,
        Spacer(1, 4 * mm),
    ]

    meta = Table(
        [["Selected Month", period_label], ["Employee", worker_name]],
        colWidths=[45 * mm, 100 * mm],
    )
    meta.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), ROW_TINT),
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
        ("BACKGROUND", (0, 0), (-1, 0), FOREST),
        ("TEXTCOLOR", (0, 0), (-1, 0), GOLD),
        ("ALIGN", (0, 0), (-1, 0), "CENTER"),
        ("FONTNAME", (0, 0), (-1, 1), "Helvetica-Bold"),
        ("BACKGROUND", (0, 1), (-1, 1), HEADER_GREEN),
        ("TEXTCOLOR", (0, 1), (-1, 1), colors.white),
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
        ("BACKGROUND", (0, last), (-1, last), GOLD),
        ("TEXTCOLOR", (0, last), (-1, last), FOREST),
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


def _cache_root() -> Path:
    root = Path(__file__).resolve().parent.parent / "data" / "payslips"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _stamp(summary: Any, period_label: str) -> str:
    return "|".join([
        period_label,
        str(getattr(summary, "updated_at", "") or ""),
        str(getattr(summary, "hours_logged", "")),
        str(getattr(summary, "rate_per_hour", "")),
        str(getattr(summary, "bonus", "")),
        str(getattr(summary, "final_net", "")),
        str(getattr(summary, "fx_rate", "")),
        str(getattr(summary, "local_currency", "") or ""),
        str(getattr(summary, "base_currency", "") or ""),
    ])


def _cache_paths(period_id: UUID, summary_id: UUID) -> tuple[Path, Path]:
    folder = _cache_root() / str(period_id)
    folder.mkdir(parents=True, exist_ok=True)
    return folder / f"{summary_id}.pdf", folder / f"{summary_id}.stamp"


def payslip_filename(period_label: str, worker_name: str) -> str:
    safe_period = period_label.replace(" ", "-")
    safe_name = worker_name.replace(" ", "-")
    return f"payslip-{safe_period}-{safe_name}.pdf"


def render_payslip_pdf(
    *,
    summary: Any,
    period: Any,
    worker_name: str,
    force: bool = False,
) -> tuple[str, bytes]:
    """Return (filename, bytes), reusing the cache when the payslip has not changed."""
    filename = payslip_filename(period.label, worker_name)
    pdf_path, stamp_path = _cache_paths(period.id, summary.id)
    stamp = _stamp(summary, period.label)
    if not force and pdf_path.exists() and stamp_path.exists():
        if stamp_path.read_text(encoding="utf-8").strip() == stamp:
            return filename, pdf_path.read_bytes()

    pdf = build_payslip_pdf(
        worker_name=worker_name,
        period_label=period.label,
        local_currency=summary.local_currency,
        base_currency=summary.base_currency or period.currency,
        rows=payslip_rows(summary),
    )
    pdf_path.write_bytes(pdf)
    stamp_path.write_text(stamp, encoding="utf-8")
    return filename, pdf


def generate_period_pdfs(db: Any, period_id: UUID, *, force: bool = False) -> dict[str, int]:
    """Build (or refresh) one cached PDF per payslip row in the period."""
    from sqlmodel import select

    from models.payroll import PayrollPeriod, PayrollWorkerSummary
    from models.worker import Worker

    period = db.get(PayrollPeriod, period_id)
    if not period:
        raise ValueError("Payroll period not found")

    summaries = db.exec(
        select(PayrollWorkerSummary).where(PayrollWorkerSummary.payroll_period_id == period_id)
    ).all()
    if not summaries:
        raise ValueError("No payslips — calculate the period first.")

    generated = 0
    reused = 0
    for summary in summaries:
        worker = db.get(Worker, summary.worker_id)
        name = worker.display_name if worker else "Worker"
        pdf_path, stamp_path = _cache_paths(period.id, summary.id)
        stamp = _stamp(summary, period.label)
        if not force and pdf_path.exists() and stamp_path.exists() and stamp_path.read_text(encoding="utf-8").strip() == stamp:
            reused += 1
            continue
        render_payslip_pdf(summary=summary, period=period, worker_name=name, force=True)
        generated += 1

    period.export_generated_at = datetime.now(timezone.utc)
    db.add(period)
    db.commit()
    return {"generated": generated, "reused": reused, "total": len(summaries)}
