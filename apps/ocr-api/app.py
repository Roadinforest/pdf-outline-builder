from __future__ import annotations

import os
import shutil
import tempfile
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from ocr_pdf import convert_pdf


app = FastAPI(title="PDF OCR Converter", version="1.0.0")

configured_cors_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=configured_cors_origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$|^https://[a-z0-9-]+\.vercel\.app$",
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.get("/")
def index() -> dict[str, str]:
    return {
        "service": "pdf-ocr-api",
        "status": "ok",
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/convert")
async def convert(
    file: UploadFile = File(...),
    dpi: int = Form(160),
    min_confidence: float = Form(0.35),
    image_format: str = Form("jpeg"),
    jpeg_quality: int = Form(90),
) -> FileResponse:
    validate_upload(file, dpi, min_confidence, image_format, jpeg_quality)

    work_dir = Path(tempfile.mkdtemp(prefix="pdf-ocr-web-"))
    input_pdf = work_dir / f"{uuid4().hex}.pdf"
    output_pdf = work_dir / "converted.pdf"

    try:
        with input_pdf.open("wb") as destination:
            shutil.copyfileobj(file.file, destination)

        await run_in_threadpool(
            convert_pdf,
            input_pdf,
            output_pdf,
            dpi,
            min_confidence,
            image_format,
            jpeg_quality,
            False,
        )
    except Exception as exc:
        shutil.rmtree(work_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        await file.close()

    return FileResponse(
        output_pdf,
        media_type="application/pdf",
        filename=output_filename(file.filename),
        background=BackgroundTask(shutil.rmtree, work_dir, ignore_errors=True),
    )


def validate_upload(
    file: UploadFile,
    dpi: int,
    min_confidence: float,
    image_format: str,
    jpeg_quality: int,
) -> None:
    if file.content_type not in {"application/pdf", "application/octet-stream"}:
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
    if file.filename and not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="The uploaded file must be a PDF.")
    if not 72 <= dpi <= 300:
        raise HTTPException(status_code=400, detail="DPI must be between 72 and 300.")
    if not 0 <= min_confidence <= 1:
        raise HTTPException(
            status_code=400, detail="Minimum confidence must be between 0 and 1."
        )
    if image_format not in {"jpeg", "png"}:
        raise HTTPException(status_code=400, detail="Image format must be jpeg or png.")
    if not 1 <= jpeg_quality <= 100:
        raise HTTPException(
            status_code=400, detail="JPEG quality must be between 1 and 100."
        )


def output_filename(filename: str | None) -> str:
    stem = Path(filename or "converted").stem or "converted"
    safe_stem = "".join(
        char if char.isalnum() or char in {"-", "_"} else "_" for char in stem
    ).strip("_")
    return f"{safe_stem or 'converted'}_ocr.pdf"
