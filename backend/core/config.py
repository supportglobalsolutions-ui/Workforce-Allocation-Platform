from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # ── App ───────────────────────────────────────────────────
    ENVIRONMENT: str = "development"
    ALLOWED_ORIGINS: list[str] = ["http://localhost:3000"]

    # ── Dev-only auth bypass ──────────────────────────────────
    # When true, requests with no/invalid Firebase token are treated as a fixed
    # test user. NEVER enable in production. Used only to test flows in isolation.
    DEV_AUTH_BYPASS: bool = False
    DEV_AUTH_ROLE: str = "user"  # role of the fake test user: user | admin | super_admin

    # ── Database ──────────────────────────────────────────────
    DATABASE_URL: str = "postgresql://postgres:122333@localhost:5432/workforceallocationdb"

    # ── Redis ─────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"

    # ── Firestore mirror reconciliation ──────────────────────
    # How often the background loop re-asserts PG state onto Firestore and
    # prunes orphaned docs, so the mirror self-heals after transient failures.
    MIRROR_RECONCILE_INTERVAL_SECONDS: int = 300

    # ── RDP session lifecycle ─────────────────────────────────
    RDP_HEARTBEAT_IDLE_SECONDS: int = 600       # 10m without heartbeat → idle
    RDP_IDLE_AUTO_RELEASE_SECONDS: int = 1200   # 20m idle → auto-release
    RDP_LIFECYCLE_INTERVAL_SECONDS: int = 60    # background tick interval

    # ── Apache Guacamole ──────────────────────────────────────
    GUACAMOLE_URL: str = "http://localhost:8080/guacamole"
    GUACAMOLE_USERNAME: str = "guacadmin"
    GUACAMOLE_PASSWORD: str = "guacadmin"

    # ── Firebase Admin ────────────────────────────────────────
    FIREBASE_CREDENTIALS_PATH: str = "./firebase-service-account.json"
    FIREBASE_PROJECT_ID: str = ""
    FIREBASE_DATABASE_URL: str = ""

    # ── Uptime Kuma (RDP TCP heartbeat) ─────────────────────
    UPTIME_KUMA_URL: str = "http://localhost:3001"
    UPTIME_KUMA_WEBHOOK_SECRET: str = ""

    # ── Resend email ──────────────────────────────────────────
    RESEND_API_KEY: str = ""
    RESEND_FROM_EMAIL: str = "GlobalSolutions <noreply@gsdeck.com>"

    # ── FX rates ──────────────────────────────────────────────
    # Free endpoint returning {"rates": {"KES": 129.3, ...}} for a base currency.
    FX_API_URL: str = "https://open.er-api.com/v6/latest"

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"


settings = Settings()
