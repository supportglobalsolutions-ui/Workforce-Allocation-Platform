import asyncio
import logging
import traceback
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from core.config import settings
from core.supabase_auth import is_auth_ready
from core.rate_limit import enforce_global_rate_limit
from core.security_validation import validate_production_settings
from routers import (
    assessments, audit, auth, clients, communications, currencies, intelligence, leaderboard,
    notifications, partners, payroll, payment_tiers, quality, rates, rdp, sessions, shifts,
    settings as platform_settings, task_assessments, training, uptime_kuma, wallets, workers,
)
from services.email_dispatch import run_email_dispatch_loop
from services.email_resend import close_http_client
from services.rdp_lifecycle import run_rdp_lifecycle_loop

_log_level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)
if settings.is_production:
    _log_level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)
logging.basicConfig(level=_log_level)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.is_production:
        validate_production_settings()
    elif settings.DEV_AUTH_BYPASS:
        logger.warning("DEV_AUTH_BYPASS is enabled — never use this in production")

    currency_routes = [getattr(r, "path", "") for r in app.routes if "currenc" in getattr(r, "path", "")]
    logger.info(
        "API ready — %s routes; currencies=%s",
        len(app.routes),
        bool(currency_routes),
    )
    auth_required = not (settings.DEV_AUTH_BYPASS and not settings.is_production)
    if auth_required and not is_auth_ready():
        logger.warning(
            "Supabase auth is not fully configured - set SUPABASE_URL, "
            "SUPABASE_SECRET_KEY and SUPABASE_JWKS_URL. Every authenticated "
            "request will be rejected until then."
        )
    elif not auth_required:
        logger.warning("Development auth bypass enabled; tokens are not verified.")

    background_tasks = [asyncio.create_task(run_rdp_lifecycle_loop())]
    if settings.EMAIL_DISPATCH_ENABLED:
        background_tasks.append(asyncio.create_task(run_email_dispatch_loop()))
    yield
    for task in background_tasks:
        task.cancel()
    for task in background_tasks:
        try:
            await task
        except asyncio.CancelledError:
            pass
    close_http_client()


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


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    if request.url.path != "/health":
        try:
            enforce_global_rate_limit(request)
        except HTTPException as exc:
            return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    return await call_next(request)


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["X-XSS-Protection"] = "0"
    if settings.is_production:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.error(
        "Unhandled exception on %s %s:\n%s",
        request.method,
        request.url,
        traceback.format_exc(),
    )
    if settings.is_production:
        return JSONResponse(status_code=500, content={"detail": "Internal server error"})
    return JSONResponse(status_code=500, content={"detail": str(exc), "type": type(exc).__name__})


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    if settings.is_production and exc.status_code >= 500:
        logger.error("HTTP %s on %s %s: %s", exc.status_code, request.method, request.url, exc.detail)
        return JSONResponse(status_code=exc.status_code, content={"detail": "Internal server error"})
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.get("/health")
def health():
    return {"status": "ok"}


app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(assessments.router, prefix="/assessments", tags=["assessments"])
app.include_router(task_assessments.router, prefix="/task-assessments", tags=["task-assessments"])
app.include_router(workers.router, prefix="/workers", tags=["workers"])
app.include_router(partners.router, prefix="/partners", tags=["partners"])
app.include_router(clients.router, prefix="/clients", tags=["clients"])
app.include_router(currencies.router, prefix="/currencies", tags=["currencies"])
app.include_router(wallets.router, prefix="/wallets", tags=["wallets"])
app.include_router(rates.router, prefix="/rates", tags=["rates"])
app.include_router(payment_tiers.router, prefix="/payment-tiers", tags=["payment-tiers"])
app.include_router(training.router, prefix="/training", tags=["training"])
app.include_router(communications.router, prefix="/communications", tags=["communications"])
app.include_router(platform_settings.router, prefix="/settings", tags=["settings"])
app.include_router(shifts.router, prefix="/shifts", tags=["shifts"])
app.include_router(rdp.router, prefix="/rdp", tags=["rdp"])
app.include_router(sessions.router, prefix="/sessions", tags=["sessions"])
app.include_router(payroll.router, prefix="/payroll", tags=["payroll"])
app.include_router(intelligence.router, prefix="/intelligence", tags=["intelligence"])
app.include_router(quality.router, prefix="/quality", tags=["quality"])
app.include_router(leaderboard.router, prefix="/leaderboard", tags=["leaderboard"])
app.include_router(audit.router, prefix="/audit", tags=["audit"])
app.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
app.include_router(uptime_kuma.router, prefix="/integrations/uptime-kuma", tags=["integrations"])
