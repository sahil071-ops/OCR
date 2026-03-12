"""
OCR Microservice – FastAPI
Exposes a single POST /ocr endpoint that:
  1. Accepts an image or PDF (multipart file OR base64 JSON body)
  2. Converts PDF pages to images if needed
  3. Runs image preprocessing (OpenCV: deskew, contrast, denoise)
  4. Runs Tesseract OCR (via pytesseract)
  5. Returns structured JSON with text + confidence

Lightweight: ~400 MB Docker image, no PyTorch, no model downloads.
Designed to be deployed as a separate Railway service.
The Next.js app calls this service; if it is unavailable the app falls back
to Tesseract.js, and if that also fails it escalates to Claude (rescue lane).
"""

import logging
import os
import tempfile
import base64
from pathlib import Path
from typing import Optional

import uvicorn
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from preprocessing import preprocess_for_ocr
from ocr_engine import extract_text

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Invoice OCR Service",
    description="PaddleOCR-based text extraction for invoice images and PDFs",
    version="1.0.0",
)

# Allow the Next.js app (same private network) to call this service
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in production if needed
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


# ──────────────────────────────────────────────────────────────
# Request / Response models
# ──────────────────────────────────────────────────────────────


class OcrBase64Request(BaseModel):
    """Alternative input: base64-encoded image or PDF."""
    image_base64: str
    filename: str = "document.jpg"


class OcrResponse(BaseModel):
    text: str
    confidence: float          # 0.0 – 1.0
    method: str                # paddleocr | paddleocr-pdf | error
    page_count: int = 1
    word_count: int = 0
    error: Optional[str] = None


# ──────────────────────────────────────────────────────────────
# Endpoints
# ──────────────────────────────────────────────────────────────


@app.get("/health")
def health():
    return {"status": "ok", "service": "ocr"}


@app.post("/ocr", response_model=OcrResponse)
async def ocr_file(file: UploadFile = File(...)):
    """
    Main OCR endpoint.
    Accepts multipart file upload (image or PDF).
    """
    contents = await file.read()
    filename = file.filename or "document"
    return _run_ocr(contents, filename)


@app.post("/ocr/base64", response_model=OcrResponse)
async def ocr_base64(body: OcrBase64Request):
    """
    Alternative OCR endpoint accepting base64-encoded file.
    Useful when the caller cannot easily do multipart uploads.
    """
    try:
        contents = base64.b64decode(body.image_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 data")
    return _run_ocr(contents, body.filename)


# ──────────────────────────────────────────────────────────────
# Core processing
# ──────────────────────────────────────────────────────────────


def _run_ocr(file_bytes: bytes, filename: str) -> OcrResponse:
    """
    Orchestrates: PDF→images if needed → preprocess → PaddleOCR.
    Returns an OcrResponse regardless of failure (error field set if failed).
    """
    ext = Path(filename).suffix.lower()
    is_pdf = ext == ".pdf" or file_bytes[:4] == b"%PDF"

    try:
        if is_pdf:
            return _process_pdf(file_bytes)
        else:
            return _process_image(file_bytes)
    except Exception as exc:
        logger.error("OCR pipeline failed for %s: %s", filename, exc)
        return OcrResponse(
            text="",
            confidence=0.0,
            method="error",
            error=str(exc),
        )


def _process_image(image_bytes: bytes) -> OcrResponse:
    """Preprocess + PaddleOCR a single image."""
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        preprocessed = preprocess_for_ocr(image_bytes)
        tmp.write(preprocessed)
        tmp_path = tmp.name

    try:
        result = extract_text(tmp_path)
        return OcrResponse(
            text=result.text,
            confidence=result.confidence,
            method=result.method,
            page_count=1,
            word_count=result.word_count,
            error=result.error,
        )
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


def _process_pdf(pdf_bytes: bytes) -> OcrResponse:
    """
    Convert each PDF page to an image, run OCR on each,
    then combine results. Returns aggregate confidence.
    """
    from pdf2image import convert_from_bytes

    try:
        images = convert_from_bytes(
            pdf_bytes,
            dpi=200,          # 200 DPI is a good OCR resolution
            fmt="PNG",
            thread_count=2,
        )
    except Exception as exc:
        logger.warning("pdf2image failed, treating PDF as raw image: %s", exc)
        return _process_image(pdf_bytes)

    if not images:
        return OcrResponse(text="", confidence=0.0, method="paddleocr-pdf")

    all_text: list[str] = []
    all_confidences: list[float] = []
    total_words = 0

    for page_num, pil_image in enumerate(images, start=1):
        # Convert PIL to bytes for our preprocessing pipeline
        import io
        buf = io.BytesIO()
        pil_image.save(buf, format="PNG")
        img_bytes = buf.getvalue()

        page_result = _process_image(img_bytes)
        if page_result.text:
            all_text.append(f"--- Page {page_num} ---\n{page_result.text}")
        all_confidences.append(page_result.confidence)
        total_words += page_result.word_count

    combined_text = "\n\n".join(all_text)
    avg_confidence = (
        sum(all_confidences) / len(all_confidences) if all_confidences else 0.0
    )

    return OcrResponse(
        text=combined_text,
        confidence=round(avg_confidence, 4),
        method="paddleocr-pdf",
        page_count=len(images),
        word_count=total_words,
    )


# ──────────────────────────────────────────────────────────────
# Entry point
# ──────────────────────────────────────────────────────────────


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8001"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
