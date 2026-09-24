from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Empty KEY= in .env must not crash int/bool parsing — treat as unset.
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", env_ignore_empty=True)

    # ── App ───────────────────────────────────────────────────
    ENVIRONMENT: str = "development"
    ALLOWED_ORIGINS: list[str] = ["http://localhost:3000"]

    # ── Logging ───────────────────────────────────────────────
    LOG_LEVEL: str = "DEBUG"

    # ── Session cookie (signed HttpOnly cookie for Next.js middleware) ──
    SESSION_COOKIE_SECRET: str = ""

    # Fernet key encrypting secrets at rest (RDP credentials). Generate with:
    #   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    # Falls back to a key derived from OTP_PEPPER when unset.
    SECRET_ENCRYPTION_KEY: str = ""

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
    # Public publishable key used only to ask GoTrue to send a recovery email.
    SUPABASE_PUBLISHABLE_KEY: str = ""

    # Token verification. JWKS (RS256) is preferred; the shared secret is the
    # legacy HS256 path and is used only as a fallback.
    SUPABASE_JWKS_URL: str = ""
    SUPABASE_JWT_SECRET: str = ""

    # ── Redis ─────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"

    # ── RDP session lifecycle ─────────────────────────────────
    # A tunnel disconnect keeps its exclusive claim briefly, allowing a
    # worker to reconnect after a Wi-Fi blip without losing the desktop.
    RDP_DISCONNECT_GRACE_SECONDS: int = 300
    RDP_LIFECYCLE_INTERVAL_SECONDS: int = 60    # background tick interval
    # When false, API workers do not run lifecycle/reconcile loops — use the
    # standalone workforce-rdp-coordinator systemd unit instead (Phase 4).
    # Default true keeps a single-box deploy working via Redis leader election.
    RDP_RUN_COORDINATOR_IN_API: bool = True
    # Numeric live-session ceiling. 0 (default) = unlimited — we do not intend
    # to enforce a fixed max-session count. Set a positive value only if ops
    # later chooses to hard-cap claims on this host.
    RDP_MAX_LIVE_SESSIONS: int = 0
    # Per-gateway seat cap when RDP_GATEWAYS lists multiple media nodes.
    RDP_GATEWAY_CAPACITY: int = 50
    # JSON array of gateway nodes (Phase 7). Empty → single GUACAMOLE_PUBLIC_URL.
    # Example:
    # [{"id":"gw1","public_url":"https://guac1.example.com",
    #   "private_url":"http://10.0.0.2:8080/guacamole","capacity":50}]
    RDP_GATEWAYS: str = ""

    # ── Phase 8: silent-failure guards ────────────────────────
    # An allocation stuck in `ending` this long becomes `quarantined` instead
    # of hanging forever. "Unknown is not free" needs an exit, not a loop.
    RDP_ENDING_ESCALATE_SECONDS: int = 90

    # After Redis/Postgres come back, hold off on releases this long. A long
    # outage leaves every idle machine already past its grace window; without
    # this the first healthy tick would release the whole fleet at once,
    # instead of giving workers a fair reconnect.
    RDP_DEGRADED_RECOVERY_SECONDS: int = 300

    # The sweep must see a machine sessionless this many consecutive ticks
    # before starting its grace clock. One flaky REST call is not evidence.
    RDP_SWEEP_CONFIRMATIONS: int = 2
    # Kill live gateway sessions that match no open allocation. Off until the
    # direct gateway path is live, because on the proxy path a session can
    # legitimately exist for a moment before its allocation row commits.
    RDP_SWEEP_KILL_ORPHANS: bool = False

    # New connects admitted per gateway per second. Shapes the thundering herd
    # when a media node restarts and every viewer reconnects at once.
    RDP_GATEWAY_ADMIT_PER_SECOND: int = 5

    # ── Apache Guacamole ──────────────────────────────────────
    GUACAMOLE_URL: str = "http://localhost:8080/guacamole"
    GUACAMOLE_USERNAME: str = "guacadmin"
    GUACAMOLE_PASSWORD: str = ""

    # ── Direct Guacamole media plane (Phase 5) ────────────────
    # Public origin the browser opens the canvas against, e.g.
    # https://guac.gsdeck.com. Pixels go here; they never touch FastAPI.
    # Empty means the legacy Python ws-tunnel stays in the pixel path.
    GUACAMOLE_PUBLIC_URL: str = ""

    # 128-bit key shared with guacamole-auth-json (`json-secret-key` in
    # guacamole.properties). 32 hex characters. FastAPI signs and encrypts a
    # one-connection auth blob with it, so a worker's browser can mint a
    # Guacamole token scoped to the single machine they claimed — no
    # guacadmin login in the browser.
    GUACAMOLE_JSON_SECRET_KEY: str = ""

    # Lifetime of the single-use join ticket FastAPI hands the browser. Long
    # enough to POST it to Guacamole, short enough to be useless if copied.
    RDP_JOIN_TICKET_TTL_SECONDS: int = 30
    # Lifetime stamped into the auth-json blob. The tunnel outlives it; this
    # only bounds how long the blob itself can mint a token.
    RDP_GUAC_SESSION_TTL_SECONDS: int = 600

    # Rollout switch for the direct gateway: off | pilot | on.
    #   off   — everyone keeps the Python ws-tunnel
    #   pilot — only PILOT emails get the direct canvas
    #   on    — everyone gets the direct canvas
    RDP_DIRECT_GATEWAY_MODE: str = "off"
    RDP_DIRECT_GATEWAY_PILOT_EMAILS: str = ""

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

    # Founder Super Admins. Nobody — including other Super Admins — can delete,
    # ban, or demote these emails. Comma-separated. Override in .env to match
    # the two people who must always retain access.
    PROTECTED_SUPER_ADMIN_EMAILS: str = (
        "peterkelvinkibiru1532@gmail.com,support.globalsolutions@gmail.com,dcm.ltd0@gmail.com"
    )

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @property
    def protected_super_admin_emails(self) -> frozenset[str]:
        return frozenset(
            part.strip().lower()
            for part in self.PROTECTED_SUPER_ADMIN_EMAILS.split(",")
            if part.strip()
        )

    @property
    def direct_gateway_pilot_emails(self) -> frozenset[str]:
        return frozenset(
            part.strip().lower()
            for part in self.RDP_DIRECT_GATEWAY_PILOT_EMAILS.split(",")
            if part.strip()
        )

    @property
    def guacamole_public_url(self) -> str:
        """Public Guacamole origin, without a trailing slash."""
        return (self.GUACAMOLE_PUBLIC_URL or "").strip().rstrip("/")

    @property
    def direct_gateway_configured(self) -> bool:
        """True when the media plane can actually be reached without FastAPI."""
        return bool(self.guacamole_public_url and self.GUACAMOLE_JSON_SECRET_KEY.strip())


settings = Settings()
