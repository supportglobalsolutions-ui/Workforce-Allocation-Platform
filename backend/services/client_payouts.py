"""
Client payouts: what each client is paid for a month, in its own currency.

The amount is the client's share from the ledger (services.client_billing),
worked out in USD. `prepare` turns those shares into payout rows and freezes
the USD → payout-currency rate; approving the month calls it. A payout marked
paid is final: its amounts and the client's ledger row can no longer change.
"""
from __future__ import annotations

import base64
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from io import BytesIO
from pathlib import Path
from typing import Iterable, Optional
from uuid import UUID

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlmodel import Session, select

from models.client import Client
from models.client_payout import ClientPayout
from models.enums import PayrollPeriodStatusEnum
from models.payroll import PayrollPeriod
from services import client_billing
from services.client_billing import BILLING_CURRENCY, ClientMonth
from services.payslip_pdf import BORDER, FOREST, GOLD, HEADER_GREEN, MUTED, ROW_TINT

ZERO = Decimal("0")
TWO_DP = Decimal("0.01")
READY_STATUSES = (PayrollPeriodStatusEnum.approved, PayrollPeriodStatusEnum.paid)


class PayoutError(ValueError):
    pass


def _q(value: Decimal) -> Decimal:
    return Decimal(value).quantize(TWO_DP, rounding=ROUND_HALF_UP)


def _fmt(value: Optional[Decimal]) -> str:
    return "—" if value is None else f"{Decimal(value):,.2f}"


def is_ready(period: PayrollPeriod) -> bool:
    """Payouts are prepared, sent and paid once the month is approved."""
    return period.status in READY_STATUSES


def payout_fx(db: Session, currency: str, *, live: bool = True) -> Optional[Decimal]:
    """How many units of `currency` one USD buys. `live` may fetch from the FX API."""
    from services.fx import ensure_rate, get_rate

    currency = (currency or BILLING_CURRENCY).upper()
    if currency == BILLING_CURRENCY:
        return Decimal("1")
    return (ensure_rate if live else get_rate)(db, BILLING_CURRENCY, currency)


def payouts_for(db: Session, period_id: UUID) -> dict[UUID, ClientPayout]:
    return {
        p.client_id: p
        for p in db.exec(select(ClientPayout).where(ClientPayout.payroll_period_id == period_id)).all()
    }


def _mark_changed(payout: ClientPayout) -> None:
    payout.statement_path = None
    if payout.status == "sent":
        payout.status = "draft"
        payout.sent_at = None


def prepare(
    db: Session,
    period: PayrollPeriod,
    *,
    refresh_fx: bool = False,
    months: Optional[list[ClientMonth]] = None,
) -> dict[str, int]:
    """
    Create or update one payout per client with a share this month. Paid
    payouts are left alone. The rate is kept once set unless `refresh_fx` (on
    approval) or the payout currency changed. A sent statement whose amount
    changes goes back to draft so it is sent again. Caller commits.
    """
    months = months if months is not None else client_billing.build(db, period)
    client_billing.snapshot(db, period, months)
    existing = payouts_for(db, period.id)
    now = datetime.now(timezone.utc)
    created = updated = removed = no_fx = 0

    for m in months:
        payout = existing.get(m.client_id)
        if payout is not None and payout.status == "paid":
            continue
        if m.client_share == 0:
            if payout is not None and payout.status == "draft":
                db.delete(payout)
                removed += 1
            if payout is None or payout.status == "draft":
                continue
        is_new = payout is None
        if payout is None:
            payout = ClientPayout(
                client_id=m.client_id, payroll_period_id=period.id,
                amount_usd=ZERO, currency=m.payout_currency,
            )
            created += 1

        old = (Decimal(payout.amount_usd or 0), payout.currency, payout.amount_local)
        if refresh_fx or payout.fx_rate is None or payout.currency != m.payout_currency:
            payout.fx_rate = payout_fx(db, m.payout_currency)
        payout.currency = m.payout_currency
        payout.amount_usd = m.client_share
        payout.amount_local = _q(m.client_share * Decimal(payout.fx_rate)) if payout.fx_rate else None
        if payout.fx_rate is None:
            no_fx += 1
        if (Decimal(payout.amount_usd), payout.currency, payout.amount_local) != old:
            _mark_changed(payout)
            if not is_new:
                updated += 1
        payout.updated_at = now
        db.add(payout)
    db.flush()
    return {"created": created, "updated": updated, "removed": removed, "no_fx": no_fx}


def _month(db: Session, period: PayrollPeriod, client_id: UUID) -> ClientMonth:
    months = client_billing.build(db, period, [client_id])
    if not months:
        raise PayoutError("Client not found.")
    return months[0]


def get_payout(db: Session, payout_id: UUID) -> tuple[ClientPayout, PayrollPeriod, Client]:
    payout = db.get(ClientPayout, payout_id)
    if not payout:
        raise LookupError("Payout not found")
    period = db.get(PayrollPeriod, payout.payroll_period_id)
    client = db.get(Client, payout.client_id)
    if not period or not client:
        raise LookupError("Payout not found")
    return payout, period, client


def _require_unpaid(period: PayrollPeriod, payout: ClientPayout) -> None:
    if payout.status == "paid":
        raise PayoutError("This payout is already marked paid.")
    if period.status == PayrollPeriodStatusEnum.paid:
        raise PayoutError("This month is already paid.")


def set_rate(db: Session, payout: ClientPayout, period: PayrollPeriod, fx_rate: Decimal) -> None:
    """Admin override of the frozen rate. Caller commits."""
    _require_unpaid(period, payout)
    if fx_rate <= 0:
        raise PayoutError("The rate must be above zero.")
    if payout.currency == BILLING_CURRENCY and fx_rate != 1:
        raise PayoutError("A USD payout always uses a rate of 1.")
    payout.fx_rate = Decimal(fx_rate)
    payout.amount_local = _q(Decimal(payout.amount_usd) * payout.fx_rate)
    _mark_changed(payout)
    payout.updated_at = datetime.now(timezone.utc)
    db.add(payout)


def mark_paid(
    db: Session, payout: ClientPayout, period: PayrollPeriod, *,
    reference: Optional[str], actor_id: Optional[UUID], paid_at: Optional[datetime] = None,
) -> None:
    """Record the payment. From here the payout and the client's month are locked. Caller commits."""
    if not is_ready(period):
        raise PayoutError("Approve the month before paying clients.")
    if payout.status == "paid":
        raise PayoutError("This payout is already marked paid.")
    if payout.fx_rate is None or payout.amount_local is None:
        raise PayoutError("No exchange rate for this payout: set one first.")
    payout.status = "paid"
    payout.paid_at = paid_at or datetime.now(timezone.utc)
    payout.reference = (reference or "").strip() or None
    payout.paid_by = actor_id
    payout.updated_at = datetime.now(timezone.utc)
    db.add(payout)


def undo_paid(db: Session, payout: ClientPayout, period: PayrollPeriod) -> None:
    """Undo a mistaken 'paid'. Not possible once the whole month is paid. Caller commits."""
    if payout.status != "paid":
        raise PayoutError("This payout is not marked paid.")
    if period.status == PayrollPeriodStatusEnum.paid:
        raise PayoutError("This month is already paid.")
    payout.status = "sent" if payout.sent_at else "draft"
    payout.paid_at = None
    payout.reference = None
    payout.paid_by = None
    payout.updated_at = datetime.now(timezone.utc)
    db.add(payout)


# ── Statement ─────────────────────────────────────────────────────────────────

def statement_rows(m: ClientMonth) -> list[tuple[str, str, str]]:
    """(item, USD figure, meaning). The last row is the amount due."""
    hours_note = {
        "desktops": "Hours logged on your desktops this month.",
        "typed": "Hours billed this month.",
    }.get(m.hours_source or "", "No hours recorded.")
    share_before = _q(m.basis * m.client_pct / 100)
    rows = [
        ("Billed hours", _fmt(m.billed_hours), hours_note),
        ("Rate per hour", _fmt(m.rate), "Billing rate in USD."),
        ("Expected income", _fmt(m.expected), "Billed hours multiplied by the rate."),
        ("Received income", _fmt(m.actual), "What the platform actually paid out."),
        ("Split on", _fmt(m.basis),
         "Received income." if m.basis_source == "actual" else "Expected income (nothing received yet)."),
        ("Your %", f"{m.client_pct:.2f}%", "Your agreed share of the income."),
        ("Your share before costs", _fmt(share_before), "Split amount multiplied by your %."),
    ]
    if m.shared_costs:
        rows.append(("Shared costs", f"-{_fmt(m.shared_costs)}", "Your part of shared running costs."))
    if m.one_off_costs:
        rows.append(("Other costs", f"-{_fmt(m.one_off_costs)}", "Costs charged to you this month."))
    rows.append(("Amount due to you", _fmt(m.client_share), "Your share after costs."))
    return rows


def build_statement_pdf(
    *, client_name: str, period_label: str, currency: str,
    fx_rate: Optional[Decimal], amount_local: Optional[Decimal], rows: list[tuple[str, str, str]],
) -> bytes:
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm, topMargin=18 * mm, bottomMargin=18 * mm,
        title=f"Statement {period_label} — {client_name}",
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
    elements = [Paragraph("GlobalSolutions — Client statement", title_style), gold_rule, Spacer(1, 4 * mm)]

    meta_rows = [["Month", period_label], ["Client", client_name]]
    if currency != BILLING_CURRENCY:
        meta_rows.append(["Exchange rate", f"1 USD = {fx_rate:,.6f} {currency}" if fx_rate else "Not set"])
    meta = Table(meta_rows, colWidths=[45 * mm, 100 * mm])
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

    data = [["Your month", "", ""], ["Item", "USD", "Meaning"]]
    for item, usd, meaning in rows:
        data.append([item, usd, Paragraph(meaning, meaning_style)])
    data.append([f"Paid to you ({currency})", _fmt(amount_local), Paragraph("Amount due converted to your currency.", meaning_style)])
    table = Table(data, colWidths=[52 * mm, 36 * mm, 86 * mm], repeatRows=2)
    last = len(data) - 1
    table.setStyle(TableStyle([
        ("SPAN", (0, 0), (-1, 0)),
        ("BACKGROUND", (0, 0), (-1, 0), FOREST),
        ("TEXTCOLOR", (0, 0), (-1, 0), GOLD),
        ("ALIGN", (0, 0), (-1, 0), "CENTER"),
        ("FONTNAME", (0, 0), (-1, 1), "Helvetica-Bold"),
        ("BACKGROUND", (0, 1), (-1, 1), HEADER_GREEN),
        ("TEXTCOLOR", (0, 1), (-1, 1), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("ALIGN", (1, 1), (1, -1), "RIGHT"),
        ("FONTNAME", (0, 2), (0, -1), "Helvetica-Bold"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("BACKGROUND", (0, last), (-1, last), GOLD),
        ("TEXTCOLOR", (0, last), (-1, last), FOREST),
        ("FONTNAME", (0, last), (-1, last), "Helvetica-Bold"),
    ]))
    elements.append(table)
    doc.build(elements)
    return buf.getvalue()


def _statement_root() -> Path:
    root = Path(__file__).resolve().parent.parent / "data" / "client_statements"
    root.mkdir(parents=True, exist_ok=True)
    return root


def statement_filename(period_label: str, client_name: str) -> str:
    safe = lambda s: "".join(ch if ch.isalnum() or ch in "-_" else "-" for ch in s.replace(" ", "-"))
    return f"statement-{safe(period_label)}-{safe(client_name)}.pdf"


def render_statement(
    db: Session, payout: ClientPayout, period: PayrollPeriod, client: Client,
) -> tuple[str, bytes]:
    """(filename, PDF). Paid payouts reuse the stored PDF; others are rebuilt from the ledger."""
    filename = statement_filename(period.label, client.name)
    if payout.status == "paid" and payout.statement_path and Path(payout.statement_path).exists():
        return filename, Path(payout.statement_path).read_bytes()
    m = _month(db, period, client.id)
    pdf = build_statement_pdf(
        client_name=client.name, period_label=period.label, currency=payout.currency,
        fx_rate=payout.fx_rate, amount_local=payout.amount_local, rows=statement_rows(m),
    )
    folder = _statement_root() / str(period.id)
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{client.id}.pdf"
    path.write_bytes(pdf)
    payout.statement_path = str(path)
    db.add(payout)
    return filename, pdf


def send_statement(
    db: Session, payout: ClientPayout, period: PayrollPeriod, client: Client, *, to_email: Optional[str] = None,
) -> tuple[bool, Optional[str]]:
    """Email the statement PDF. Test mode only reaches allowed addresses. Commits."""
    from services.email_resend import (
        render_client_statement_html, render_client_statement_text, send_email_detailed,
    )

    if not is_ready(period):
        raise PayoutError("Approve the month before sending statements.")
    address = (to_email or client.payout_email or "").strip()
    if not address:
        raise PayoutError(f"{client.name} has no payout email.")
    if payout.amount_local is None:
        raise PayoutError("No exchange rate for this payout: set one first.")

    filename, pdf = render_statement(db, payout, period, client)
    m = _month(db, period, client.id)
    rows = statement_rows(m)
    local = _fmt(payout.amount_local)
    log, _resend_id = send_email_detailed(
        db,
        to_email=address,
        subject=f"Your GlobalSolutions statement — {period.label}",
        html=render_client_statement_html(
            client_name=client.name, period_label=period.label,
            currency=payout.currency, amount_local=local, rows=rows,
        ),
        text=render_client_statement_text(
            client_name=client.name, period_label=period.label,
            currency=payout.currency, amount_local=local, rows=rows,
        ),
        template="client_statement",
        attachments=[{"filename": filename, "content": base64.b64encode(pdf).decode()}],
        payroll_period_id=period.id,
    )
    if log.status != "sent":
        return False, log.error
    if payout.status != "paid":
        payout.status = "sent"
    payout.sent_at = datetime.now(timezone.utc)
    db.add(payout)
    db.commit()
    return True, None


def totals(payouts: Iterable[ClientPayout]) -> dict[str, str]:
    owed = paid = ZERO
    for p in payouts:
        if p.status == "paid":
            paid += Decimal(p.amount_usd)
        else:
            owed += Decimal(p.amount_usd)
    return {"total_usd": str(_q(owed + paid)), "paid_usd": str(_q(paid)), "outstanding_usd": str(_q(owed))}
