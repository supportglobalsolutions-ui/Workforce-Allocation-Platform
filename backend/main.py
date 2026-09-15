import asyncio
import uuid
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
    assessments, audit, auth, clients, communications, contact, currencies, intelligence, leaderboard,
    notifications, partners, payroll, payment_tiers, quality, rates, rdp, sessions, shifts,
    settings as platform_settings, task_assessments, training, uptime_kuma, wallets, workers,
)
from services.email_dispatch import run_email_dispatch_loop
from services.email_resend import close_http_client
from services.email_events import run_email_events_loop
from services.rdp_lifecycle import run_rdp_lifecycle_loop
from services.rdp_reconcile import run_rdp_reconcile_loop
from services.period_lifecycle import run_period_lifecycle_loop

_log_level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)
if settings.is_production:
    _log_level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)
logging.basicConfig(level=_log_level)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.is_production:
        validate_production_settings()

    currency_routes = [getattr(r, "path", "") for r in app.routes if "currenc" in getattr(r, "path", "")]
    logger.info(
        "API ready — %s routes; currencies=%s",
        len(app.routes),
        bool(currency_routes),
    )
    if not is_auth_ready():
        logger.warning(
            "Supabase auth is not fully configured - set SUPABASE_URL, "
            "SUPABASE_SECRET_KEY and SUPABASE_JWKS_URL. Every authenticated "
            "request will be rejected until then."
        )

    background_tasks = [
        asyncio.create_task(run_rdp_lifecycle_loop()),
        # Rebuilds Guacamole connections that do not exist on this host, so a
        # fresh deployment provisions itself instead of showing black screens.
        asyncio.create_task(run_rdp_reconcile_loop()),
        asyncio.create_task(run_period_lifecycle_loop()),
    ]
    if settings.EMAIL_DISPATCH_ENABLED:
        background_tasks.append(asyncio.create_task(run_email_dispatch_loop()))
    if settings.RESEND_API_KEY:
        # Without this, email_log stays on "sent" and bounced or suppressed
        # verification codes never surface anywhere.
        background_tasks.append(asyncio.create_task(run_email_events_loop()))
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
async def avoid_proxy_slash_redirect(request: Request, call_next):
    """Serve /settings on the same path so the Next proxy does not follow a
    redirect to the raw backend URL (the browser then fails CORS)."""
    if request.method == "GET" and request.url.path == "/settings":
        request.scope["path"] = "/settings/"
        request.scope["raw_path"] = b"/settings/"
    return await call_next(request)


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    # Session-cookie issuance has its own verified-user limiter in auth.py.
    # Excluding it here prevents Vercel edge traffic from sharing one global
    # IP bucket and blocking valid signed-in users.
    if request.url.path not in {"/health", "/auth/session-token"}:
        try:
            enforce_global_rate_limit(request)
        except HTTPException as exc:
            return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    return await call_next(request)


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    """
    Tag every request so a message the user sees can be traced to the exact
    server-side log line. The id goes back in X-Request-ID and, on failures,
    inside the JSON body — the browser console prints it next to the friendly
    message, so "it broke" becomes a grep.
    """
    incoming = (request.headers.get("x-request-id") or "").strip()
    request_id = incoming[:64] if incoming else uuid.uuid4().hex[:12]
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response


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


def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "") or "-"


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """
    The full traceback always goes to the server log. What crosses the wire
    depends on environment: production sends only the id, development sends
    the real type and message so the browser console can show it.
    """
    request_id = _request_id(request)
    logger.error(
        "[%s] Unhandled %s on %s %s:\n%s",
        request_id,
        type(exc).__name__,
        request.method,
        request.url,
        traceback.format_exc(),
    )
    body = {
        "detail": "Something went wrong on our side. Please try again.",
        "request_id": request_id,
    }
    if not settings.is_production:
        body["debug"] = {"type": type(exc).__name__, "message": str(exc)[:500]}
    return JSONResponse(status_code=500, content=body, headers={"X-Request-ID": request_id})


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    request_id = _request_id(request)
    if exc.status_code >= 500:
        logger.error(
            "[%s] HTTP %s on %s %s: %s",
            request_id, exc.status_code, request.method, request.url, exc.detail,
        )
        detail = "Something went wrong on our side. Please try again." if settings.is_production else exc.detail
    else:
        # 4xx are the caller's problem and already phrased for a human; log at
        # a level that does not drown real failures.
        logger.info(
            "[%s] HTTP %s on %s %s: %s",
            request_id, exc.status_code, request.method, request.url, exc.detail,
        )
        detail = exc.detail
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": detail, "request_id": request_id},
        headers={"X-Request-ID": request_id},
    )


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
# Public contact form (POST) + admin inbox (GET/PATCH).
app.include_router(contact.router, prefix="/contact", tags=["contact"])
app.include_router(uptime_kuma.router, prefix="/integrations/uptime-kuma", tags=["integrations"])
