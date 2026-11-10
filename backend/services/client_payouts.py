"""
Payee payouts: what each payee is paid for a month, in their own currency.

Every client split names its recipients (payees). A payee's payout is the sum
of their recipient amounts across all clients that month, with one line per
client, one combined statement and one payment. Global Solutions' amounts are
kept, not paid out. `prepare` builds the payouts and freezes the USD →
payout-currency rate; approving the month calls it. A payout marked paid is
final: its amounts and the ledger rows of the clients on it can no longer
change.

Months paid before payees existed keep their per-client `ClientPayout` rows,
shown read-only as the earlier format.
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

from models.client import Payee
from models.client_payout import ClientPayout, PayeePayout, PayeePayoutLine
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


def payee_currency(payee: Optional[Payee]) -> str:
    return ((payee.payout_currency if payee else None) or BILLING_CURRENCY).upper()


# ── Lookups ───────────────────────────────────────────────────────────────────

def payouts_for(db: Session, period_id: UUID) -> dict[UUID, PayeePayout]:
    return {
        p.payee_id: p
        for p in db.exec(select(PayeePayout).where(PayeePayout.payroll_period_id == period_id)).all()
    }


def lines_for(db: Session, payout_ids: Iterable[UUID]) -> dict[UUID, list[PayeePayoutLine]]:
    ids = list(payout_ids)
    out: dict[UUID, list[PayeePayoutLine]] = {pid: [] for pid in ids}
    if ids:
        for line in db.exec(select(PayeePayoutLine).where(PayeePayoutLine.payout_id.in_(ids))).all():
            out.setdefault(line.payout_id, []).append(line)
    return out


def legacy_payouts(db: Session, period_id: UUID) -> list[ClientPayout]:
    return list(db.exec(select(ClientPayout).where(ClientPayout.payroll_period_id == period_id)).all())


def _set_lines(db: Session, payout: PayeePayout, lines: list[tuple[UUID, Decimal, Decimal]]) -> None:
    for old in db.exec(select(PayeePayoutLine).where(PayeePayoutLine.payout_id == payout.id)).all():
        db.delete(old)
    db.flush()
    for client_id, pct, amount in lines:
        db.add(PayeePayoutLine(payout_id=payout.id, client_id=client_id, pct=pct, amount_usd=amount))


def payee_amounts(
    months: Iterable[ClientMonth], skip_clients: Iterable[UUID] = (),
) -> dict[UUID, list[tuple[UUID, Decimal, Decimal]]]:
    """{payee: [(client, pct, USD amount)]} from the recipients, Global Solutions left out."""
    skip = set(skip_clients)
    out: dict[UUID, list[tuple[UUID, Decimal, Decimal]]] = {}
    for m in months:
        if m.client_id in skip:
            continue
        for r in m.recipients:
            if r["is_gs"] or r["payee_id"] is None or r["amount"] == 0:
                continue
            out.setdefault(r["payee_id"], []).append((m.client_id, r["pct"], r["amount"]))
    return out


# ── Prepare ───────────────────────────────────────────────────────────────────

def _mark_changed(payout: PayeePayout) -> None:
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
    payees: Optional[dict[UUID, Payee]] = None,
) -> dict[str, int]:
    """
    Create or update one payout per payee owed money this month. Paid payouts
    are left alone, and so are clients already paid in the earlier per-client
    format. The rate is kept once set unless `refresh_fx` (on approval) or the
    payee's currency changed. A sent statement whose figures change goes back
    to draft so it is sent again. Caller commits.
    """
    months = months if months is not None else client_billing.build(db, period)
    client_billing.snapshot(db, period, months)
    payees = payees if payees is not None else {p.id: p for p in db.exec(select(Payee)).all()}
    paid_legacy = {p.client_id for p in legacy_payouts(db, period.id) if p.status == "paid"}
    existing = payouts_for(db, period.id)
    current_lines = lines_for(db, [p.id for p in existing.values()])
    paid_clients = {
        line.client_id
        for p in existing.values() if p.status == "paid"
        for line in current_lines.get(p.id, [])
    }
    grouped = payee_amounts(months, paid_legacy | paid_clients)
    # A client on a paid payout is locked: other payees keep the lines already saved for it.
    for payee_id, payout in existing.items():
        if payout.status == "paid":
            continue
        for line in current_lines.get(payout.id, []):
            if line.client_id in paid_clients:
                grouped.setdefault(payee_id, []).append(
                    (line.client_id, Decimal(line.pct), Decimal(line.amount_usd)),
                )
    now = datetime.now(timezone.utc)
    created = updated = removed = no_fx = 0

    for payee_id, payout in list(existing.items()):
        if payout.status != "paid" and payee_id not in grouped:
            db.delete(payout)
            removed += 1

    for payee_id, lines in grouped.items():
        payout = existing.get(payee_id)
        if payout is not None and payout.status == "paid":
            continue
        total = _q(sum((amount for _, _, amount in lines), ZERO))
        if total <= 0:
            if payout is not None:
                db.delete(payout)
                removed += 1
            continue
        currency = payee_currency(payees.get(payee_id))
        is_new = payout is None
        if payout is None:
            payout = PayeePayout(payee_id=payee_id, payroll_period_id=period.id, amount_usd=ZERO, currency=currency)
            db.add(payout)
            db.flush()
            created += 1
        old = (
            Decimal(payout.amount_usd or 0), payout.currency, payout.amount_local,
            sorted((l.client_id, _q(Decimal(l.amount_usd))) for l in current_lines.get(payout.id, [])),
        )
        if refresh_fx or payout.fx_rate is None or payout.currency != currency:
            payout.fx_rate = payout_fx(db, currency)
        payout.currency = currency
        payout.amount_usd = total
        payout.amount_local = _q(total * Decimal(payout.fx_rate)) if payout.fx_rate else None
        if payout.fx_rate is None:
            no_fx += 1
        new_lines = sorted((cid, _q(amount)) for cid, _, amount in lines)
        if (Decimal(payout.amount_usd), payout.currency, payout.amount_local, new_lines) != old:
            _set_lines(db, payout, lines)
            _mark_changed(payout)
            if not is_new:
                updated += 1
        payout.updated_at = now
        db.add(payout)
    db.flush()
    return {"created": created, "updated": updated, "removed": removed, "no_fx": no_fx}


def get_payout(db: Session, payout_id: UUID) -> tuple[PayeePayout, PayrollPeriod, Payee]:
    payout = db.get(PayeePayout, payout_id)
    if not payout:
        raise LookupError("Payout not found")
    period = db.get(PayrollPeriod, payout.payroll_period_id)
    payee = db.get(Payee, payout.payee_id)
    if not period or not payee:
        raise LookupError("Payout not found")
    return payout, period, payee


def _require_unpaid(period: PayrollPeriod, payout: PayeePayout) -> None:
    if payout.status == "paid":
        raise PayoutError("This payout is already marked paid.")
    if period.status == PayrollPeriodStatusEnum.paid:
        raise PayoutError("This month is already paid.")


def set_rate(db: Session, payout: PayeePayout, period: PayrollPeriod, fx_rate: Decimal) -> None:
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
    db: Session, payout: PayeePayout, period: PayrollPeriod, *,
    reference: Optional[str], actor_id: Optional[UUID], paid_at: Optional[datetime] = None,
) -> None:
    """Record the payment. From here the payout and its clients' months are locked. Caller commits."""
    if not is_ready(period):
        raise PayoutError("Approve the month before paying recipients.")
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


def undo_paid(db: Session, payout: PayeePayout, period: PayrollPeriod) -> None:
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

def client_section(m: ClientMonth, payee_id: UUID) -> list[tuple[str, str, str]]:
    """(item, USD figure, meaning) for one client on a payee's statement. Last row is the payee's amount."""
    recipient = next((r for r in m.recipients if r["payee_id"] == payee_id), None)
    revenue_note = {
        "actual": "Income received from the account this month.",
        "expected": "Hours on the account multiplied by its rate (not received yet).",
    }.get(m.billing_source or "", "No income recorded.")
    rows = [("Revenue", _fmt(m.billing), revenue_note)]
    if m.billed_hours is not None:
        rows.append(("Hours", _fmt(m.billed_hours), "Hours billed on the account."))
    rows += [
        ("Worker pay", f"-{_fmt(m.worker_cost)}", "What the workers on the account earned."),
        ("Transfer cost", f"-{_fmt(m.transfer_cost)}", "Cost of sending the workers' pay."),
        ("Other costs", f"-{_fmt(m.client_costs)}", "Shared running costs and other costs for the account."),
        ("Net distributable", _fmt(m.net_distributable), "Revenue less every cost, shared between the recipients."),
    ]
    if recipient is None:
        rows.append(("Your share", _fmt(ZERO), "You are no longer on this account's split."))
        return rows
    rows.append(("Your %", f"{recipient['pct']:.2f}%", "Your agreed part of the net distributable."))
    if recipient["amount_override"] is not None and recipient["amount_override"] != recipient["amount_calc"]:
        rows.append(("Worked out", _fmt(recipient["amount_calc"]), "Net distributable multiplied by your %."))
        rows.append(("Your share", _fmt(recipient["amount"]), "Set by Global Solutions when finalising the month."))
    else:
        rows.append(("Your share", _fmt(recipient["amount"]), "Net distributable multiplied by your %."))
    return rows


def statement_sections(
    months: Iterable[ClientMonth], payee_id: UUID, client_ids: Iterable[UUID],
) -> list[tuple[str, list[tuple[str, str, str]]]]:
    wanted = list(client_ids)
    by_id = {m.client_id: m for m in months}
    return [(by_id[cid].client_name, client_section(by_id[cid], payee_id)) for cid in wanted if cid in by_id]


def email_rows(
    sections: list[tuple[str, list[tuple[str, str, str]]]], total_usd: Decimal,
) -> list[tuple[str, str, str]]:
    """One row per client (the payee's share) and the total, for the email body."""
    rows = []
    for client_name, section in sections:
        share = next((r for r in reversed(section) if r[0] == "Your share"), section[-1])
        pct = next((r[1] for r in section if r[0] == "Your %"), "")
        rows.append((client_name, share[1], f"Your share ({pct}) of the account's net distributable."))
    rows.append(("Amount due to you", _fmt(total_usd), "Total of your shares this month."))
    return rows


def build_statement_pdf(
    *, payee_name: str, period_label: str, currency: str, fx_rate: Optional[Decimal],
    amount_local: Optional[Decimal], total_usd: Decimal, sections: list[tuple[str, list[tuple[str, str, str]]]],
) -> bytes:
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm, topMargin=18 * mm, bottomMargin=18 * mm,
        title=f"Statement {period_label} — {payee_name}",
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
    elements = [Paragraph("GlobalSolutions — Payout statement", title_style), gold_rule, Spacer(1, 4 * mm)]

    meta_rows = [["Month", period_label], ["Paid to", payee_name], ["Accounts", str(len(sections))]]
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

    for client_name, rows in sections:
        data = [[client_name, "", ""], ["Item", "USD", "Meaning"]]
        for item, usd, meaning in rows:
            data.append([item, usd, Paragraph(meaning, meaning_style)])
        table = Table(data, colWidths=[52 * mm, 36 * mm, 86 * mm], repeatRows=2)
        last = len(data) - 1
        table.setStyle(TableStyle([
            ("SPAN", (0, 0), (-1, 0)),
            ("BACKGROUND", (0, 0), (-1, 0), FOREST),
            ("TEXTCOLOR", (0, 0), (-1, 0), GOLD),
            ("FONTNAME", (0, 0), (-1, 1), "Helvetica-Bold"),
            ("BACKGROUND", (0, 1), (-1, 1), HEADER_GREEN),
            ("TEXTCOLOR", (0, 1), (-1, 1), colors.white),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
            ("ALIGN", (1, 1), (1, -1), "RIGHT"),
            ("FONTNAME", (0, 2), (0, -1), "Helvetica-Bold"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("BACKGROUND", (0, last), (-1, last), ROW_TINT),
            ("FONTNAME", (0, last), (-1, last), "Helvetica-Bold"),
        ]))
        elements += [table, Spacer(1, 5 * mm)]

    total = Table(
        [
            ["Total due (USD)", _fmt(total_usd)],
            [f"Paid to you ({currency})", _fmt(amount_local)],
        ],
        colWidths=[88 * mm, 86 * mm],
    )
    total.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), GOLD),
        ("TEXTCOLOR", (0, 0), (-1, -1), FOREST),
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    elements.append(total)
    doc.build(elements)
    return buf.getvalue()


def _statement_root() -> Path:
    root = Path(__file__).resolve().parent.parent / "data" / "payee_statements"
    root.mkdir(parents=True, exist_ok=True)
    return root


def statement_filename(period_label: str, payee_name: str) -> str:
    safe = lambda s: "".join(ch if ch.isalnum() or ch in "-_" else "-" for ch in s.replace(" ", "-"))
    return f"statement-{safe(period_label)}-{safe(payee_name)}.pdf"


def _sections(db: Session, payout: PayeePayout, period: PayrollPeriod):
    lines = lines_for(db, [payout.id]).get(payout.id, [])
    client_ids = [l.client_id for l in lines]
    months = client_billing.build(db, period, client_ids) if client_ids else []
    return statement_sections(months, payout.payee_id, client_ids)


def render_statement(
    db: Session, payout: PayeePayout, period: PayrollPeriod, payee: Payee,
) -> tuple[str, bytes]:
    """(filename, PDF). Paid payouts reuse the stored PDF; others are rebuilt from the ledger."""
    filename = statement_filename(period.label, payee.name)
    if payout.status == "paid" and payout.statement_path and Path(payout.statement_path).exists():
        return filename, Path(payout.statement_path).read_bytes()
    pdf = build_statement_pdf(
        payee_name=payee.name, period_label=period.label, currency=payout.currency, fx_rate=payout.fx_rate,
        amount_local=payout.amount_local, total_usd=Decimal(payout.amount_usd),
        sections=_sections(db, payout, period),
    )
    folder = _statement_root() / str(period.id)
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{payee.id}.pdf"
    path.write_bytes(pdf)
    payout.statement_path = str(path)
    db.add(payout)
    return filename, pdf


def send_statement(
    db: Session, payout: PayeePayout, period: PayrollPeriod, payee: Payee, *, to_email: Optional[str] = None,
) -> tuple[bool, Optional[str]]:
    """Email the combined statement PDF. Test mode only reaches allowed addresses. Commits."""
    from services.email_resend import (
        render_client_statement_html, render_client_statement_text, send_email_detailed,
    )

    if not is_ready(period):
        raise PayoutError("Approve the month before sending statements.")
    address = (to_email or payee.payout_email or "").strip()
    if not address:
        raise PayoutError(f"{payee.name} has no payout email.")
    if payout.amount_local is None:
        raise PayoutError("No exchange rate for this payout: set one first.")

    filename, pdf = render_statement(db, payout, period, payee)
    rows = email_rows(_sections(db, payout, period), Decimal(payout.amount_usd))
    local = _fmt(payout.amount_local)
    log, _resend_id = send_email_detailed(
        db,
        to_email=address,
        subject=f"Your GlobalSolutions statement — {period.label}",
        html=render_client_statement_html(
            client_name=payee.name, period_label=period.label,
            currency=payout.currency, amount_local=local, rows=rows,
        ),
        text=render_client_statement_text(
            client_name=payee.name, period_label=period.label,
            currency=payout.currency, amount_local=local, rows=rows,
        ),
        template="payee_statement",
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


def totals(payouts: Iterable) -> dict[str, str]:
    owed = paid = ZERO
    for p in payouts:
        if p.status == "paid":
            paid += Decimal(p.amount_usd)
        else:
            owed += Decimal(p.amount_usd)
    return {"total_usd": str(_q(owed + paid)), "paid_usd": str(_q(paid)), "outstanding_usd": str(_q(owed))}
