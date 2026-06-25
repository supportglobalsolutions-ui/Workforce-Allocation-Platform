# Import order follows foreign-key dependency chain so SQLModel/SQLAlchemy
# mapper configuration resolves without forward-reference errors.

from sqlmodel import SQLModel  # noqa: F401 — exposes SQLModel.metadata for Alembic

from .enums import (  # noqa: F401
    AdminRoleEnum, AccountStatusEnum, WorkerTypeEnum, WorkerStatusEnum,
    EntityStatusEnum, RdpStatusEnum, ShiftStatusEnum, ReleaseReasonEnum,
    SessionTypeEnum, SessionCloseEnum, PayrollSessionEnum, RateTypeEnum,
    PayrollPeriodStatusEnum, IndicatorInputEnum, TicketStatusEnum,
)
from .admin_users  import AdminUser                                                           # noqa: F401
from .partner      import PartnerEntity, PartnerArrangement, PartnerClientOverride            # noqa: F401
from .worker       import Worker                                                              # noqa: F401
from .rdp_machine  import RDPResource                                                         # noqa: F401
from .shift        import Shift                                                               # noqa: F401
from .allocation   import Allocation                                                          # noqa: F401
from .payroll      import PayrollPeriod, PayrollLineItem                                      # noqa: F401
from .session      import Session                                                             # noqa: F401
from .rate_table   import RateTableEntry                                                      # noqa: F401
from .quality      import QualityIndicator, QualityIndicatorRating, QualityCompositeScore     # noqa: F401
from .mcq          import McqAssessmentSet, McqQuestion, McqResult, McqResultAnswer           # noqa: F401
from .audit_log    import AuditLog                                                            # noqa: F401
from .post_mvp     import SessionTicket, KnowledgeBaseArticle                                 # noqa: F401
