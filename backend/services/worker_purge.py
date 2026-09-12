"""Controlled purge of workers and their dependent rows."""
from __future__ import annotations

import logging
from uuid import UUID

from sqlalchemy import delete, update as sa_update
from sqlmodel import Session, select

from core.supabase_auth import ban_auth_user
from models.allocation import Allocation
from models.client import Client
from models.email_job import EmailJobItem
from models.email_log import EmailLog
from models.enums import RdpStatusEnum
from models.mcq import McqResult, McqResultAnswer
from models.notification import Notification
from models.payroll import PayrollLineItem, PayrollWorkerSummary
from models.quality import QualityCompositeScore, QualityIndicatorRating
from models.rate_table import RateTableEntry
from models.rdp_machine import RDPResource
from models.session import Session as WorkSession
from models.shift import Shift
from models.task_assessment import TaskAssessmentResult, TaskResultActivityScore
from models.training import TrainingProgress
from models.wallet import Wallet, WalletTransaction
from models.worker import Worker
from services.session_purge import purge_sessions

logger = logging.getLogger(__name__)


def purge_workers(db: Session, worker_ids: list[UUID]) -> dict:
    """
    Permanently remove workers and dependent operational data.

    Order matters for FKs. Supabase accounts linked to the worker are banned
    (login disabled). The admin_users login row is kept but unlinked.
    """
    unique_ids = list(dict.fromkeys(worker_ids))
    workers = db.exec(select(Worker).where(Worker.id.in_(unique_ids))).all()
    found = {w.id: w for w in workers}
    missing = [str(i) for i in unique_ids if i not in found]
    deleted: list[dict] = []

    for wid in unique_ids:
        worker = found.get(wid)
        if not worker:
            continue

        snapshot = {
            "id": str(worker.id),
            "display_name": worker.display_name,
            "country": worker.country,
            "admin_user_id": str(worker.admin_user_id) if worker.admin_user_id else None,
        }

        # Release RDP assignment
        assigned = db.exec(select(RDPResource).where(RDPResource.assigned_worker_id == wid)).all()
        for resource in assigned:
            resource.assigned_worker_id = None
            if resource.status in {RdpStatusEnum.assigned, RdpStatusEnum.active, RdpStatusEnum.idle}:
                resource.status = RdpStatusEnum.online_free
            db.add(resource)

        # Ban auth login if linked
        auth_user_id = None
        if worker.admin_user is not None:
            auth_user_id = worker.admin_user.auth_user_id
        elif worker.admin_user_id:
            from models.admin_users import AdminUser
            admin = db.get(AdminUser, worker.admin_user_id)
            auth_user_id = admin.auth_user_id if admin else None
        if auth_user_id:
            try:
                ban_auth_user(auth_user_id)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Could not ban Supabase user for worker %s: %s", wid, exc)

        # Sessions (including active)
        session_ids = list(db.exec(select(WorkSession.id).where(WorkSession.worker_id == wid)).all())
        if session_ids:
            purge_sessions(db, session_ids, allow_active=True)

        # Payroll
        summary_ids = list(
            db.exec(select(PayrollWorkerSummary.id).where(PayrollWorkerSummary.worker_id == wid)).all()
        )
        if summary_ids:
            db.exec(
                sa_update(EmailJobItem)
                .where(EmailJobItem.payroll_worker_summary_id.in_(summary_ids))
                .values(payroll_worker_summary_id=None)
            )
        db.exec(delete(PayrollLineItem).where(PayrollLineItem.worker_id == wid))
        db.exec(delete(PayrollWorkerSummary).where(PayrollWorkerSummary.worker_id == wid))

        # Quality
        db.exec(delete(QualityIndicatorRating).where(QualityIndicatorRating.worker_id == wid))
        db.exec(delete(QualityCompositeScore).where(QualityCompositeScore.worker_id == wid))

        # Assessments
        mcq_ids = list(db.exec(select(McqResult.id).where(McqResult.worker_id == wid)).all())
        if mcq_ids:
            db.exec(delete(McqResultAnswer).where(McqResultAnswer.mcq_result_id.in_(mcq_ids)))
            db.exec(delete(McqResult).where(McqResult.id.in_(mcq_ids)))

        task_ids = list(
            db.exec(select(TaskAssessmentResult.id).where(TaskAssessmentResult.worker_id == wid)).all()
        )
        if task_ids:
            db.exec(
                delete(TaskResultActivityScore).where(TaskResultActivityScore.result_id.in_(task_ids))
            )
            db.exec(delete(TaskAssessmentResult).where(TaskAssessmentResult.id.in_(task_ids)))

        # Training / notifications / rates / shifts / allocations
        db.exec(delete(TrainingProgress).where(TrainingProgress.worker_id == wid))
        db.exec(delete(Notification).where(Notification.target_worker_id == wid))
        db.exec(delete(RateTableEntry).where(RateTableEntry.worker_id == wid))
        db.exec(delete(Shift).where(Shift.worker_id == wid))
        db.exec(delete(Allocation).where(Allocation.worker_id == wid))

        # Wallet
        wallets = db.exec(select(Wallet).where(Wallet.worker_id == wid)).all()
        wallet_ids = [w.id for w in wallets]
        if wallet_ids:
            db.exec(delete(WalletTransaction).where(WalletTransaction.wallet_id.in_(wallet_ids)))
            db.exec(delete(Wallet).where(Wallet.id.in_(wallet_ids)))
        db.exec(delete(WalletTransaction).where(WalletTransaction.worker_id == wid))

        # Soft-unlink email history (keep audit of sends)
        db.exec(sa_update(EmailLog).where(EmailLog.worker_id == wid).values(worker_id=None))
        db.exec(sa_update(EmailJobItem).where(EmailJobItem.worker_id == wid).values(worker_id=None))

        # Clients that pointed at this worker as owner
        db.exec(sa_update(Client).where(Client.owner_worker_id == wid).values(owner_worker_id=None))

        # Unlink admin_user unique FK then delete worker
        worker.admin_user_id = None
        db.add(worker)
        db.flush()
        db.delete(worker)
        deleted.append(snapshot)

    db.flush()
    return {
        "deleted": deleted,
        "deleted_count": len(deleted),
        "missing": missing,
    }
