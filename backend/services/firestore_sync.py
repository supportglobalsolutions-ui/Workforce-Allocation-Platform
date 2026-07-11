"""
Firestore sync helpers — fire-and-forget writes that never fail the caller.
Requires google-cloud-firestore (installed with firebase-admin[firestore]).
"""
import logging

logger = logging.getLogger(__name__)


def _client():
    from firebase_admin import firestore  # type: ignore[import]
    return firestore.client()


def _sync(collection: str, doc_id: str, data: dict) -> None:
    try:
        _client().collection(collection).document(doc_id).set(data)
    except Exception as exc:
        logger.warning("Firestore sync failed for %s/%s: %s", collection, doc_id, exc)


def _delete(collection: str, doc_id: str) -> None:
    try:
        _client().collection(collection).document(doc_id).delete()
    except Exception as exc:
        logger.warning("Firestore delete failed for %s/%s: %s", collection, doc_id, exc)


# ── Task assessments ───────────────────────────────────────────────────────────

def sync_task_assessment(data: dict) -> None:
    _sync("task_assessments", str(data["id"]), {
        **data,
        "id": str(data["id"]),
        "created_by": str(data["created_by"]),
    })


def delete_task_assessment(assessment_id: str) -> None:
    _delete("task_assessments", assessment_id)


def sync_task_result(data: dict) -> None:
    _sync("task_results", str(data["id"]), {
        **data,
        "id": str(data["id"]),
        "task_assessment_id": str(data["task_assessment_id"]),
        "worker_id": str(data["worker_id"]),
        "graded_by": str(data["graded_by"]) if data.get("graded_by") else None,
    })
