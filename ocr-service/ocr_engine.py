"""
Tesseract OCR engine wrapper (via pytesseract).
Returns extracted text, per-word confidence, and aggregate confidence score.
Designed to be swappable – any replacement just needs to implement extract_text().

Why pytesseract instead of EasyOCR/PaddleOCR:
- System Tesseract binary = tiny Docker image (~400 MB vs 8+ GB for PyTorch)
- No ML model downloads at build or runtime
- Reliable installation on any Linux
- With OpenCV preprocessing (deskew, contrast, denoise) the quality is
  very good for clean-to-moderate invoice scans
- Messy invoices that still fail go to Claude (the rescue lane) anyway
"""

import logging
import pytesseract
from PIL import Image
from dataclasses import dataclass, field
from typing import List, Optional

logger = logging.getLogger(__name__)

# Tesseract page segmentation modes that work well for invoices:
#   PSM 3 = fully automatic (default, good for multi-column layouts)
#   PSM 6 = uniform block of text (good for single-column invoices)
# OEM 3 = use LSTM neural net (best accuracy, default in Tesseract 4+)
TESS_CONFIG = "--oem 3 --psm 6"


@dataclass
class OcrWord:
    text: str
    confidence: float
    bbox: List[List[int]]  # [[x1,y1],[x2,y1],[x2,y2],[x1,y2]]


@dataclass
class OcrResult:
    text: str
    confidence: float        # aggregate 0.0 – 1.0
    word_count: int
    words: List[OcrWord] = field(default_factory=list)
    method: str = "tesseract-py"
    error: Optional[str] = None


def extract_text(image_path: str) -> OcrResult:
    """
    Run Tesseract on a single preprocessed image file.
    Returns structured OcrResult with full text and per-word confidence.
    """
    try:
        img = Image.open(image_path)

        # image_to_data gives us per-word bounding boxes + confidence scores
        data = pytesseract.image_to_data(
            img,
            config=TESS_CONFIG,
            output_type=pytesseract.Output.DICT,
        )

        words: List[OcrWord] = []
        confidences: List[float] = []

        n = len(data["text"])
        for i in range(n):
            text = (data["text"][i] or "").strip()
            conf_raw = data["conf"][i]

            # Tesseract returns conf=-1 for non-word elements (layout blocks)
            if not text or conf_raw == -1:
                continue

            conf_float = max(0.0, float(conf_raw) / 100.0)
            x, y, w, h = data["left"][i], data["top"][i], data["width"][i], data["height"][i]
            words.append(OcrWord(
                text=text,
                confidence=conf_float,
                bbox=[[x, y], [x + w, y], [x + w, y + h], [x, y + h]],
            ))
            confidences.append(conf_float)

        if not words:
            return OcrResult(text="", confidence=0.0, word_count=0, method="tesseract-py")

        # image_to_string gives better paragraph structure than reconstructing from words
        full_text = pytesseract.image_to_string(img, config=TESS_CONFIG).strip()
        if not full_text:
            full_text = " ".join(w.text for w in words)

        return OcrResult(
            text=full_text,
            confidence=_aggregate_confidence(confidences),
            word_count=len(words),
            words=words,
            method="tesseract-py",
        )

    except Exception as exc:
        logger.error("Tesseract extraction failed: %s", exc)
        return OcrResult(text="", confidence=0.0, word_count=0,
                         method="tesseract-py", error=str(exc))


def _aggregate_confidence(confidences: List[float]) -> float:
    """
    25th-percentile confidence – conservative but meaningful.
    A few low-confidence words will drag the score down appropriately.
    """
    if not confidences:
        return 0.0
    arr = sorted(confidences)
    idx = max(0, int(len(arr) * 0.25) - 1)
    return round(arr[idx], 4)
