"""
Report API endpoints:
- POST /api/v1/report/upload   → accepts PDF/image, kicks off async processing, returns 202
- GET  /api/v1/report/{id}     → polls status, returns 200 (complete) or 202 (processing)
"""

import uuid
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse

from app.schemas.report import ReportUploadResponse, ReportResult
from app.services.report_service import start_report_processing, get_report_status

router = APIRouter()

# Allowed MIME types (validated by content_type header — magic-byte validation would
# be added in production with python-magic)
ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/jpg",
    "text/plain",
}

MAX_FILE_SIZE_MB = 20


@router.post("/upload", status_code=202)
async def upload_report(file: UploadFile = File(...)):
    """
    Accepts a PDF or image upload, kicks off the async analysis pipeline,
    and immediately returns a report_id for polling.
    """
    # Validate content type
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {file.content_type}. "
                   f"Accepted: PDF, JPEG, PNG."
        )

    # Read file content
    content = await file.read()

    # Validate size
    size_mb = len(content) / (1024 * 1024)
    if size_mb > MAX_FILE_SIZE_MB:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({size_mb:.1f} MB). Maximum: {MAX_FILE_SIZE_MB} MB."
        )

    # Generate report ID and start async processing
    report_id = str(uuid.uuid4())
    start_report_processing(report_id, content, file.content_type)

    return ReportUploadResponse(
        report_id=report_id,
        status="processing",
        estimated_seconds=8,
    )


@router.get("/{report_id}")
async def get_report(report_id: str):
    """Poll the status of a report. Returns 200 when complete, 202 when still processing."""
    report = get_report_status(report_id)

    if report is None:
        raise HTTPException(status_code=404, detail="Report not found.")

    if report["status"] == "processing":
        return JSONResponse(
            status_code=202,
            content={
                "report_id": report_id,
                "status": "processing",
                "progress_pct": report.get("progress_pct", 0),
            },
        )

    # Complete or failed
    return ReportResult(
        report_id=report_id,
        status=report["status"],
        parsed_at=report.get("parsed_at"),
        confidence=report.get("confidence"),
        parameters=report.get("parameters"),
        summary=report.get("summary"),
        recommendation=report.get("recommendation"),
        home_remedies=report.get("home_remedies"),
        action_plan=report.get("action_plan"),
    )
