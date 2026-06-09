from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.config import settings
from core.firebase_admin import init_firebase


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_firebase()
    # Schema is managed by Alembic — never call Base.metadata.create_all() here
    yield


app = FastAPI(
    title="GlobalSolutions Platform API",
    version="1.0.0",
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


# Routers registered here as they are implemented
# from routers import auth, workers, shifts, rdp, sessions, payroll, quality, leaderboard, audit
# app.include_router(auth.router, prefix="/auth", tags=["auth"])
# app.include_router(workers.router, prefix="/workers", tags=["workers"])
# app.include_router(shifts.router, prefix="/shifts", tags=["shifts"])
# app.include_router(rdp.router, prefix="/rdp", tags=["rdp"])
# app.include_router(sessions.router, prefix="/sessions", tags=["sessions"])
# app.include_router(payroll.router, prefix="/payroll", tags=["payroll"])
# app.include_router(quality.router, prefix="/quality", tags=["quality"])
# app.include_router(leaderboard.router, prefix="/leaderboard", tags=["leaderboard"])
# app.include_router(audit.router, prefix="/audit", tags=["audit"])
