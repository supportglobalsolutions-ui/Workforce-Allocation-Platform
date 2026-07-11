import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Column, DateTime, String, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlmodel import Field, Relationship, SQLModel

from .enums import AccountStatusEnum, AccountStatusType, AdminRoleEnum, AdminRoleType

if TYPE_CHECKING:
    from .audit_log import AuditLog
    from .mcq import McqAssessmentSet
    from .notification import Notification
    from .payroll import PayrollPeriod
    from .post_mvp import KnowledgeBaseArticle
    from .quality import QualityIndicatorRating
    from .rate_table import RateTableEntry
    from .shift import Shift
    from .task_assessment import TaskAssessment, TaskAssessmentResult
    from .worker import Worker


class AdminUser(SQLModel, table=True):
    __tablename__ = "admin_users"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    firebase_uid: str = Field(sa_column=Column(String(128), unique=True, nullable=False))
    email: str = Field(sa_column=Column(String(255), unique=True, nullable=False))
    role: AdminRoleEnum = Field(sa_column=Column(AdminRoleType, nullable=False))
    display_name: str = Field(sa_column=Column(String(255), nullable=False))
    country_scope: Optional[str] = Field(default=None, sa_column=Column(String(64), nullable=True))
    status: AccountStatusEnum = Field(
        default=AccountStatusEnum.active,
        sa_column=Column(AccountStatusType, nullable=False, server_default="active"),
    )
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=text("now()"), nullable=False),
    )
    updated_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=text("now()"), nullable=False),
    )

    # Relationships
    workers: list["Worker"] = Relationship(
        back_populates="admin_user",
        sa_relationship_kwargs={"foreign_keys": "[Worker.admin_user_id]"},
    )
    approved_shifts: list["Shift"] = Relationship(
        back_populates="approver",
        sa_relationship_kwargs={"foreign_keys": "[Shift.approved_by]"},
    )
    quality_ratings: list["QualityIndicatorRating"] = Relationship(back_populates="rated_by_user")
    approved_rate_entries: list["RateTableEntry"] = Relationship(
        back_populates="approver",
        sa_relationship_kwargs={"foreign_keys": "[RateTableEntry.approved_by]"},
    )
    approved_payroll: list["PayrollPeriod"] = Relationship(
        back_populates="approver",
        sa_relationship_kwargs={"foreign_keys": "[PayrollPeriod.approved_by]"},
    )
    created_assessments: list["McqAssessmentSet"] = Relationship(back_populates="creator")
    created_task_assessments: list["TaskAssessment"] = Relationship(
        back_populates="creator",
        sa_relationship_kwargs={"foreign_keys": "[TaskAssessment.created_by]"},
    )
    graded_task_results: list["TaskAssessmentResult"] = Relationship(
        back_populates="grader",
        sa_relationship_kwargs={"foreign_keys": "[TaskAssessmentResult.graded_by]"},
    )
    audit_entries: list["AuditLog"] = Relationship(
        back_populates="actor",
        sa_relationship_kwargs={"foreign_keys": "[AuditLog.actor_id]"},
    )
    kb_articles: list["KnowledgeBaseArticle"] = Relationship(back_populates="creator")
    sent_notifications: list["Notification"] = Relationship(back_populates="sender")
