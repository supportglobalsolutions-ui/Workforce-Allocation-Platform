from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # ── App ───────────────────────────────────────────────────
    ENVIRONMENT: str = "development"
    ALLOWED_ORIGINS: list[str] = ["http://localhost:3000"]

    # ── Database ──────────────────────────────────────────────
    DATABASE_URL: str = "postgresql://postgres:122333@localhost:5432/workforceallocationdb"

    # ── Redis ─────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"

    # ── Apache Guacamole ──────────────────────────────────────
    GUACAMOLE_URL: str = "http://localhost:8080/guacamole"
    GUACAMOLE_USERNAME: str = "guacadmin"
    GUACAMOLE_PASSWORD: str = "guacadmin"

    # ── Firebase Admin ────────────────────────────────────────
    FIREBASE_CREDENTIALS_PATH: str = "./firebase-service-account.json"
    FIREBASE_PROJECT_ID: str = ""
    FIREBASE_DATABASE_URL: str = ""

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"


settings = Settings()
