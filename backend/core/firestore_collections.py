"""Canonical Firestore paths — must match docs/data-models.md Appendix B."""

RDP_STATUS = "rdp_status"
ACTIVE_SESSIONS = "active_sessions"
SHIFT_NOTIFICATIONS = "shift_notifications"
LEADERBOARD = "leaderboard"
LEADERBOARD_CURRENT_PERIOD_DOC = "current_period"
SYSTEM_ALERTS = "system_alerts"

# Deprecated — do not write; PG is source of truth
DEPRECATED_COLLECTIONS = frozenset({
    "users",
    "sessions",
    "worker_status",
    "notifications",
    "audit_events",
    "payroll",
    "rdp_machines",
    "partners",
})
