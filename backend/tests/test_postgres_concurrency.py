"""PostgreSQL gates for the ownership transitions that cannot be faked.

These tests deliberately use independent database sessions and threads. A
fakeredis test proves the fast-path lock; this file proves PostgreSQL still
preserves the ownership invariant when requests meet at the durable boundary.
"""
from __future__ import annotations

import threading
import os
from datetime import date, datetime, timezone

import pytest
from sqlalchemy import create_engine, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker
from sqlmodel import Session

from models.allocation import Allocation
from models.enums import (
    AllocationLifecycleEnum,
    RdpStatusEnum,
    WorkerStatusEnum,
    WorkerTypeEnum,
)
from models.rdp_machine import RDPResource
from models.worker import Worker


def _worker(number: int) -> Worker:
    return Worker(
        worker_type=WorkerTypeEnum.gs_registered,
        username=f"race-worker-{number}",
        display_name=f"Race worker {number}",
        country="Test",
        pay_tier="test",
        status=WorkerStatusEnum.active,
        start_date=date(2025, 1, 1),
        work_ready=True,
    )


def _resource() -> RDPResource:
    return RDPResource(
        nickname="RACE-RDP",
        country="Test",
        client_group="Concurrency",
        status=RdpStatusEnum.online_free,
        guacamole_connection_id="race-connection",
    )


@pytest.mark.postgres
def test_simultaneous_claims_leave_exactly_one_open_allocation(postgres_session):
    """N database contenders cannot bypass `uq_allocations_active_rdp`."""
    workers = [_worker(index) for index in range(8)]
    resource = _resource()
    postgres_session.add(resource)
    postgres_session.add_all(workers)
    postgres_session.commit()

    engine = create_engine(os.environ["DATABASE_URL_TEST"])
    sessions = sessionmaker(engine, expire_on_commit=False)
    barrier = threading.Barrier(len(workers))
    winners: list[str] = []
    collisions: list[BaseException] = []

    def claim(worker_id) -> None:
        with sessions() as db:
            db.add(Allocation(worker_id=worker_id, rdp_resource_id=resource.id))
            barrier.wait(timeout=10)
            try:
                db.commit()
                winners.append(str(worker_id))
            except IntegrityError as exc:
                db.rollback()
                collisions.append(exc)

    threads = [threading.Thread(target=claim, args=(worker.id,)) for worker in workers]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=20)
        assert not thread.is_alive(), "a claim transaction deadlocked"

    with Session(engine) as check:
        open_count = check.scalar(
            select(func.count()).select_from(Allocation).where(Allocation.released_at.is_(None))
        )
    engine.dispose()

    assert len(winners) == 1
    assert len(collisions) == len(workers) - 1
    assert open_count == 1


@pytest.mark.postgres
def test_takeover_generation_blocks_a_racing_stale_disconnect(postgres_session):
    """A row lock makes a stale disconnect observe takeover's new generation."""
    worker = _worker(20)
    resource = _resource()
    postgres_session.add_all([worker, resource])
    postgres_session.commit()
    allocation = Allocation(worker_id=worker.id, rdp_resource_id=resource.id, connection_generation=1)
    postgres_session.add(allocation)
    postgres_session.commit()

    engine = create_engine(os.environ["DATABASE_URL_TEST"])
    sessions = sessionmaker(engine, expire_on_commit=False)
    takeover_has_lock = threading.Event()
    disconnect_finished = threading.Event()

    def takeover() -> None:
        with sessions() as db:
            locked = db.scalar(select(Allocation).where(Allocation.id == allocation.id).with_for_update())
            assert locked is not None
            locked.connection_generation += 1
            takeover_has_lock.set()
            db.commit()

    def stale_disconnect() -> None:
        assert takeover_has_lock.wait(timeout=10)
        with sessions() as db:
            locked = db.scalar(select(Allocation).where(Allocation.id == allocation.id).with_for_update())
            assert locked is not None
            # This is the durable form of disconnect's generation_matches gate:
            # a close decided under generation 1 may never end generation 2.
            result = db.execute(
                update(Allocation)
                .where(Allocation.id == allocation.id, Allocation.connection_generation == 1)
                .values(released_at=func.now())
            )
            db.commit()
            assert result.rowcount == 0
        disconnect_finished.set()

    threads = [threading.Thread(target=takeover), threading.Thread(target=stale_disconnect)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=20)
        assert not thread.is_alive(), "takeover/disconnect deadlocked"
    assert disconnect_finished.is_set()

    with Session(engine) as check:
        current = check.get(Allocation, allocation.id)
        assert current is not None
        assert current.connection_generation == 2
        assert current.released_at is None
    engine.dispose()


@pytest.mark.postgres
def test_end_force_stop_sweep_and_ticket_redeem_preserve_ownership_invariant(postgres_session):
    """Concurrent terminal actors leave the machine free once, never ambiguous."""
    import fakeredis

    from services import rdp_join_ticket

    worker = _worker(30)
    resource = _resource()
    resource.status = RdpStatusEnum.active
    resource.assigned_worker_id = worker.id
    postgres_session.add_all([worker, resource])
    postgres_session.commit()
    allocation = Allocation(worker_id=worker.id, rdp_resource_id=resource.id)
    postgres_session.add(allocation)
    postgres_session.commit()

    redis_client = fakeredis.FakeStrictRedis()
    ticket, _claims, _ttl = rdp_join_ticket.issue_ticket(
        redis_client,
        worker_id=str(worker.id),
        allocation_id=str(allocation.id),
        rdp_id=str(resource.id),
        connection_id="race-connection",
        connection_name="RACE-RDP",
        connection_generation=1,
    )
    engine = create_engine(os.environ["DATABASE_URL_TEST"])
    sessions = sessionmaker(engine, expire_on_commit=False)
    barrier = threading.Barrier(4)
    redemptions: list[object] = []

    def terminal_actor() -> None:
        with sessions() as db:
            barrier.wait(timeout=10)
            locked_resource = db.scalar(
                select(RDPResource).where(RDPResource.id == resource.id).with_for_update()
            )
            locked_alloc = db.scalar(
                select(Allocation)
                .where(Allocation.rdp_resource_id == resource.id, Allocation.released_at.is_(None))
                .with_for_update()
            )
            if locked_alloc is not None:
                locked_alloc.released_at = datetime.now(timezone.utc)
                locked_alloc.allocation_status = AllocationLifecycleEnum.ended
                locked_resource.status = RdpStatusEnum.online_free
                locked_resource.assigned_worker_id = None
            db.commit()

    def redeem() -> None:
        barrier.wait(timeout=10)
        redemptions.append(rdp_join_ticket.redeem_ticket(redis_client, ticket))

    threads = [threading.Thread(target=terminal_actor) for _ in range(3)]
    threads.append(threading.Thread(target=redeem))
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=20)
        assert not thread.is_alive(), "terminal ownership transitions deadlocked"

    with Session(engine) as check:
        open_count = check.scalar(
            select(func.count()).select_from(Allocation).where(Allocation.released_at.is_(None))
        )
        current_resource = check.get(RDPResource, resource.id)
        assert current_resource is not None
        assert open_count == 0
        assert current_resource.status == RdpStatusEnum.online_free
        assert current_resource.assigned_worker_id is None
    engine.dispose()
    assert sum(result is not None for result in redemptions) == 1
