import asyncio
import logging
import traceback
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from core.config import settings
from core.firebase_admin import init_firebase
from routers import assessments, audit, auth, leaderboard, notifications, payroll, quality, rdp, sessions, shifts, task_assessments, uptime_kuma, workers
from services.leaderboard_sync import run_leaderboard_sync_loop
from services.mirror_reconcile import run_mirror_reconcile_loop
from services.rdp_lifecycle import run_rdp_lifecycle_loop

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_firebase()
    background_tasks = [
        asyncio.create_task(run_leaderboard_sync_loop()),
        asyncio.create_task(run_mirror_reconcile_loop()),
        asyncio.create_task(run_rdp_lifecycle_loop()),
    ]
    yield
    for task in background_tasks:
        task.cancel()
    for task in background_tasks:
        try:
            await task
        except asyncio.CancelledError:
            pass


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


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled exception on %s %s:\n%s", request.method, request.url, traceback.format_exc())
    return JSONResponse(status_code=500, content={"detail": str(exc), "type": type(exc).__name__})


@app.get("/health")
def health():
    return {"status": "ok"}


app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(assessments.router, prefix="/assessments", tags=["assessments"])
app.include_router(task_assessments.router, prefix="/task-assessments", tags=["task-assessments"])
app.include_router(workers.router, prefix="/workers", tags=["workers"])
app.include_router(shifts.router, prefix="/shifts", tags=["shifts"])
app.include_router(rdp.router, prefix="/rdp", tags=["rdp"])
app.include_router(sessions.router, prefix="/sessions", tags=["sessions"])
app.include_router(payroll.router, prefix="/payroll", tags=["payroll"])
app.include_router(quality.router, prefix="/quality", tags=["quality"])
app.include_router(leaderboard.router, prefix="/leaderboard", tags=["leaderboard"])
app.include_router(audit.router, prefix="/audit", tags=["audit"])
app.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
app.include_router(uptime_kuma.router, prefix="/integrations/uptime-kuma", tags=["integrations"])
