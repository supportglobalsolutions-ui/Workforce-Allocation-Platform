"""
Static guard against names a module uses but never binds.

Python resolves names inside function bodies at **call** time, so a missing
import there does not break `import main` — it waits and raises `NameError`
when a worker hits that endpoint. `test_app_boots.py` cannot see those: it
calls routes unauthenticated, so execution stops at the auth dependency before
reaching the body.

Both bugs that broke this project during the router refactor were of these two
shapes:

    require_admin   used in `Depends(...)` — evaluated at import, app dead
    preflight_rdp   used inside a handler — import fine, 500 on claim

Reading the AST catches both, without executing anything.
"""
from __future__ import annotations

import ast
import builtins
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]

# Modules worth guarding: the RDP surface is where the churn is.
GUARDED = [
    "routers/rdp.py",
    "routers/rdp_ops.py",
    "routers/rdp_admin.py",
    "routers/rdp_tunnel.py",
    "services/rdp_support.py",
    "services/rdp_engine.py",
    "services/rdp_gateway.py",
    "services/rdp_gateway_cluster.py",
    "services/rdp_coordinator.py",
    "services/rdp_capacity.py",
    "services/rdp_quarantine.py",
    "services/rdp_session_sweep.py",
    "services/rdp_degraded.py",
    "services/rdp_join_ticket.py",
]

BUILTIN_NAMES = set(dir(builtins)) | {"__file__", "__name__", "__doc__"}


def bound_names(tree: ast.AST) -> set[str]:
    """Every name the module could bind, anywhere in it.

    Deliberately generous — this guard is for names that appear *nowhere*, so
    over-collecting bindings only makes it quieter, never wrong.
    """
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                names.add((alias.asname or alias.name).split(".")[0])
        elif isinstance(node, ast.ImportFrom):
            for alias in node.names:
                names.add(alias.asname or alias.name)
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            names.add(node.name)
        elif isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
            names.add(node.id)
        elif isinstance(node, ast.arg):
            names.add(node.arg)
        elif isinstance(node, ast.ExceptHandler) and node.name:
            names.add(node.name)
        elif isinstance(node, ast.Global):
            names.update(node.names)
    return names


def used_names(tree: ast.AST) -> set[str]:
    return {
        node.id
        for node in ast.walk(tree)
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load)
    }


@pytest.mark.parametrize("relative", GUARDED)
def test_module_has_no_undefined_names(relative):
    path = BACKEND / relative
    if not path.exists():
        pytest.skip(f"{relative} does not exist in this layout")

    tree = ast.parse(path.read_text(encoding="utf-8"))
    missing = sorted(used_names(tree) - bound_names(tree) - BUILTIN_NAMES)
    assert not missing, (
        f"{relative} uses {missing} but never imports or defines them. "
        "A name used inside a handler still raises NameError at request time."
    )


@pytest.mark.parametrize("relative", GUARDED)
def test_no_self_shadowing_assignment(relative):
    """
    `x = x(...)` makes `x` local to the function, so the call on the right
    reads it before assignment — `UnboundLocalError` every time the handler
    runs. This shape appeared twice in `routers/rdp.py` and broke the claim
    board.
    """
    path = BACKEND / relative
    if not path.exists():
        pytest.skip(f"{relative} does not exist in this layout")

    offenders = []
    tree = ast.parse(path.read_text(encoding="utf-8"))
    for func in [n for n in ast.walk(tree) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))]:
        for stmt in ast.walk(func):
            if (
                isinstance(stmt, ast.Assign)
                and len(stmt.targets) == 1
                and isinstance(stmt.targets[0], ast.Name)
                and isinstance(stmt.value, ast.Call)
                and isinstance(stmt.value.func, ast.Name)
                and stmt.targets[0].id == stmt.value.func.id
            ):
                offenders.append(f"{func.name}() line {stmt.lineno}: {stmt.targets[0].id}")

    assert not offenders, (
        f"{relative} assigns a name from a call to itself — UnboundLocalError "
        f"at runtime: {offenders}"
    )
