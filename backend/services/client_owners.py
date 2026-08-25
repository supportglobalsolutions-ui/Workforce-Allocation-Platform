"""Resolve the display name of a client account owner."""
from __future__ import annotations

from sqlmodel import Session

from models.client import Client
from models.enums import ClientOwnerTypeEnum
from models.partner import PartnerEntity
from models.worker import Worker


def client_owner_name(db: Session, client: Client) -> str | None:
    if client.owner_type == ClientOwnerTypeEnum.gs:
        return "Global Solutions"
    if client.owner_type == ClientOwnerTypeEnum.worker and client.owner_worker_id:
        worker = db.get(Worker, client.owner_worker_id)
        return worker.display_name if worker else None
    if client.owner_type == ClientOwnerTypeEnum.partner_entity and client.owner_partner_entity_id:
        entity = db.get(PartnerEntity, client.owner_partner_entity_id)
        return entity.name if entity else None
    return None


def owner_rollup_key(client: Client | None) -> str:
    if not client:
        return "unattributed"
    if client.owner_type == ClientOwnerTypeEnum.worker and client.owner_worker_id:
        return f"worker:{client.owner_worker_id}"
    if client.owner_type == ClientOwnerTypeEnum.partner_entity and client.owner_partner_entity_id:
        return f"partner:{client.owner_partner_entity_id}"
    return "gs"
