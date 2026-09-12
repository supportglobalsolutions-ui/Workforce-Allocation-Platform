from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # ── App ───────────────────────────────────────────────────
    ENVIRONMENT: str = "development"
    ALLOWED_ORIGINS: list[str] = ["http://localhost:3000"]

    # ── Dev-only auth bypass ──────────────────────────────────
    # When true, requests with no/invalid access token are treated as a fixed
    # test user. NEVER enable in production. Used only to test flows in isolation.
    DEV_AUTH_BYPASS: bool = False
    DEV_AUTH_ROLE: str = "user"  # role of the fake test user: user | admin | super_admin

    # ── Logging ───────────────────────────────────────────────
    LOG_LEVEL: str = "DEBUG"

    # ── Session cookie (signed HttpOnly cookie for Next.js middleware) ──
    SESSION_COOKIE_SECRET: str = ""

    # ── Database (Supabase-hosted PostgreSQL) ─────────────────
    # Supabase exposes three connection strings; pick per workload:
    #   • Direct        db.<ref>.supabase.co:5432        — IPv6 only unless you
    #     buy the IPv4 add-on. Fine for Alembic from a v6-capable machine.
    #   • Session pool  aws-0-<region>.pooler.supabase.com:5432 — IPv4, one
    #     backend per client. Use this for migrations from IPv4-only hosts.
    #   • Transaction   aws-0-<region>.pooler.supabase.com:6543 — IPv4,
    #     pgbouncer. Use for the running app. NOT for Alembic.
    # Always include ?sslmode=require.
    DATABASE_URL: str = "postgresql://postgres:CHANGE_ME@localhost:5432/workforceallocationdb"

    # Set true when DATABASE_URL points at the :6543 transaction pooler. Keeps
    # SQLAlchemy from stacking its own pool on top of pgbouncer's.
    DATABASE_USE_PGBOUNCER: bool = False

    # ── Supabase project (auth + API) ─────────────────────────
    # The service key drives the GoTrue admin API (create/ban/role changes).
    # SUPABASE_SECRET_KEY is the current name; SERVICE_ROLE_KEY is the legacy
    # one. Either works — core/supabase_auth.py prefers the former.
    SUPABASE_URL: str = ""
    SUPABASE_SECRET_KEY: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""

    # Token verification. JWKS (RS256) is preferred; the shared secret is the
    # legacy HS256 path and is used only as a fallback.
    SUPABASE_JWKS_URL: str = ""
    SUPABASE_JWT_SECRET: str = ""

    # ── Redis ─────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"

    # ── RDP session lifecycle ─────────────────────────────────
    RDP_HEARTBEAT_IDLE_SECONDS: int = 600       # 10m without heartbeat → idle
    RDP_IDLE_AUTO_RELEASE_SECONDS: int = 1200   # 20m idle → auto-release
    RDP_LIFECYCLE_INTERVAL_SECONDS: int = 60    # background tick interval

    # ── Apache Guacamole ──────────────────────────────────────
    GUACAMOLE_URL: str = "http://localhost:8080/guacamole"
    GUACAMOLE_USERNAME: str = "guacadmin"
    GUACAMOLE_PASSWORD: str = ""

    # ── Uptime Kuma (RDP TCP heartbeat) ─────────────────────
    UPTIME_KUMA_URL: str = "http://localhost:3001"
    UPTIME_KUMA_WEBHOOK_SECRET: str = ""

    # ── Resend email ──────────────────────────────────────────
    RESEND_API_KEY: str = ""
    RESEND_FROM_EMAIL: str = "GlobalSolutions <noreply@gsdeck.com>"

    # Signing secret (whsec_…) of the Resend webhook that feeds delivery events
    # into the email history. Unset means the webhook endpoint rejects everything
    # and the history relies on polling instead.
    RESEND_WEBHOOK_SECRET: str = ""

    # HMAC pepper for hashing destructive-action confirmation codes. Falls back
    # to RESEND_API_KEY, then a development default — never store the plaintext.
    OTP_PEPPER: str = ""

    # Public URL of the frontend, used to build links in outgoing email
    # (e.g. the payslip "View in your wallet" button).
    APP_BASE_URL: str = "http://localhost:3000"

    # ── Bulk email dispatcher ─────────────────────────────────
    # The queue is drained by a background loop so a 1000-recipient send never
    # blocks the HTTP request. Resend allows ~10 requests/second.
    EMAIL_DISPATCH_INTERVAL_SECONDS: int = 5
    EMAIL_DISPATCH_CLAIM_SIZE: int = 100       # items claimed per tick (one batch call)
    EMAIL_DISPATCH_MAX_ATTEMPTS: int = 3
    EMAIL_DISPATCH_STUCK_MINUTES: int = 10     # reclaim items stuck in `claimed` this long
    EMAIL_DISPATCH_ENABLED: bool = True

    # ── FX rates ──────────────────────────────────────────────
    # Free endpoint returning {"rates": {"KES": 129.3, ...}} for a base currency.
    FX_API_URL: str = "https://open.er-api.com/v6/latest"

    # ── Gemini (ops briefing inspection copy) ─────────────────
    # Google AI Studio key. Empty means Analytics shows rules only.
    GOOGLE_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-3.6-flash"

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"


settings = Settings()
