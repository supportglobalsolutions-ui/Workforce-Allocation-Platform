"""
Seed a single test worker with a payslip for the current payroll period so the
full receipt flow (generate PDF + email via Resend) can be tested end to end.

Run from the backend directory (with the venv active):

    python seed_test_payslip.py --email you@gmail.com
    python seed_test_payslip.py --email you@gmail.com --name "Jane Doe" --net 820

Use a real inbox — Resend rejects @example.com / @test.com (and similar reserved domains).
Re-running with a deliverable --email also migrates any prior test-worker@example.com row.

What it does (idempotent — safe to re-run):
  1. Ensures an admin_users login row exists for --email (test-only firebase_uid).
  2. Ensures a workers profile linked to that login row.
  3. Ensures a payroll period covering today exists (status = calculated).
  4. Creates/updates that worker's PayrollWorkerSummary with sample amounts.

Then open Admin -> Finance -> Communications, pick the period, download the PDF
receipt and send it by email to confirm delivery.
"""
import argparse
from datetime import date
from decimal import Decimal

from sqlmodel import Session, select

from core.database import engine
from models.admin_users import AdminUser
from models.enums import (
    AccountStatusEnum,
    AdminRoleEnum,
    PayrollPeriodStatusEnum,
    WorkerStatusEnum,
    WorkerTypeEnum,
)
from models.payroll import PayrollPeriod, PayrollWorkerSummary
from models.worker import Worker
from services.email_resend import blocked_recipient_reason


def _month_bounds(today: date) -> tuple[date, date, str]:
    start = today.replace(day=1)
    if start.month == 12:
        next_month = start.replace(year=start.year + 1, month=1)
    else:
        next_month = start.replace(month=start.month + 1)
    end = date.fromordinal(next_month.toordinal() - 1)
    label = today.strftime("%B %Y")
    return start, end, label


def seed(email: str, name: str, country: str, currency: str, net: Decimal) -> None:
    blocked = blocked_recipient_reason(email)
    if blocked:
        raise SystemExit(f"Refusing to seed: {blocked}")

    with Session(engine) as db:
        # Migrate earlier seed rows that used @example.com (Resend cannot deliver there).
        for stale in db.exec(
            select(AdminUser).where(AdminUser.firebase_uid.like("test-worker-%"))
        ).all():
            if stale.email.lower() != email.lower() and blocked_recipient_reason(stale.email):
                print(f"[~] updating stale test login {stale.email} → {email}")
                stale.email = email
                stale.display_name = name
                db.add(stale)
                db.commit()

        # 1. login identity ---------------------------------------------------
        admin = db.exec(select(AdminUser).where(AdminUser.email == email)).first()
        if not admin:
            admin = db.exec(
                select(AdminUser).where(AdminUser.firebase_uid.like("test-worker-%"))
            ).first()
        if not admin:
            admin = AdminUser(
                firebase_uid=f"test-worker-{email}",
                email=email,
                role=AdminRoleEnum.technical_admin,
                display_name=name,
                status=AccountStatusEnum.active,
            )
            db.add(admin)
            db.commit()
            db.refresh(admin)
            print(f"[+] created admin_users login for {email}")
        else:
            if admin.email != email:
                admin.email = email
            admin.display_name = name
            admin.status = AccountStatusEnum.active
            db.add(admin)
            db.commit()
            db.refresh(admin)
            print(f"[=] reusing admin_users login for {email}")

        # 2. worker profile ---------------------------------------------------
        worker = db.exec(select(Worker).where(Worker.admin_user_id == admin.id)).first()
        if not worker:
            worker = Worker(
                admin_user_id=admin.id,
                worker_type=WorkerTypeEnum.gs_registered,
                display_name=name,
                country=country,
                pay_tier="tier_1",
                status=WorkerStatusEnum.active,
                start_date=date.today(),
                work_ready=True,
            )
            db.add(worker)
            db.commit()
            db.refresh(worker)
            print(f"[+] created worker profile '{name}'")
        else:
            print(f"[=] reusing worker profile '{worker.display_name}'")

        # 3. current payroll period ------------------------------------------
        start, end, label = _month_bounds(date.today())
        period = db.exec(
            select(PayrollPeriod).where(
                PayrollPeriod.start_date <= date.today(),
                PayrollPeriod.end_date >= date.today(),
            )
        ).first()
        if not period:
            period = PayrollPeriod(
                label=label,
                start_date=start,
                end_date=end,
                currency=currency,
                status=PayrollPeriodStatusEnum.calculated,
            )
            db.add(period)
            db.commit()
            db.refresh(period)
            print(f"[+] created payroll period '{label}' ({currency})")
        else:
            print(f"[=] reusing payroll period '{period.label}' (status={period.status.value})")

        # 4. worker summary (payslip row) ------------------------------------
        summary = db.exec(
            select(PayrollWorkerSummary).where(
                PayrollWorkerSummary.payroll_period_id == period.id,
                PayrollWorkerSummary.worker_id == worker.id,
            )
        ).first()

        rate = Decimal("5.00")
        hours = (net / rate).quantize(Decimal("0.01"))
        base_pay = (hours * rate).quantize(Decimal("0.01"))
        bonus = Decimal("0.00")
        gross = base_pay + bonus
        transfer_cost = Decimal("0.00")
        external_cost = Decimal("0.00")
        total_deductions = transfer_cost + external_cost
        final_net = gross - total_deductions

        if not summary:
            summary = PayrollWorkerSummary(
                payroll_period_id=period.id,
                worker_id=worker.id,
            )
            action = "created"
        else:
            action = "updated"

        summary.hours_logged = hours
        summary.rate_per_hour = rate
        summary.base_pay = base_pay
        summary.bonus = bonus
        summary.gross_earned = gross
        summary.transfer_cost = transfer_cost
        summary.external_cost = external_cost
        summary.total_deductions = total_deductions
        summary.final_net = final_net
        summary.local_currency = currency
        summary.base_currency = currency
        summary.fx_rate = Decimal("1.000000")
        summary.base_equivalent = final_net
        db.add(summary)
        db.commit()
        db.refresh(summary)
        print(f"[+] {action} payslip: {final_net} {currency} net for {name}")

        print("\nDone. Open Admin -> Finance -> Communications -> Payslips,")
        print(f"select period '{period.label}', then download/send the receipt for {name}.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed a test worker payslip for the current period.")
    parser.add_argument("--email", required=True, help="Recipient email (also the worker login identity).")
    parser.add_argument("--name", default="Test Worker", help="Worker display name.")
    parser.add_argument("--country", default="Kenya", help="Worker country.")
    parser.add_argument("--currency", default="USD", help="3-letter currency code.")
    parser.add_argument("--net", type=Decimal, default=Decimal("820"), help="Final net pay amount.")
    args = parser.parse_args()
    seed(args.email, args.name, args.country, args.currency.upper(), args.net)


if __name__ == "__main__":
    main()
