"""
PaddleOCR engine wrapper.
Returns extracted text, per-word confidence, and aggregate confidence score.
Designed to be swappable – any replacement just needs to implement extract_text().
"""

import logging
import os
from dataclasses import dataclass, field
from typing import List, Optional

logger = logging.getLogger(__name__)

# Lazy-initialise once so first request pays the startup cost, not import time
_ocr_instance = None


def _get_ocr():
    global _ocr_instance
    if _ocr_instance is None:
        from paddleocr import PaddleOCR
        # lang='en' covers English + digits. For mixed Hindi/English invoices
        # switch to lang='en' with use_doc_orientation_classify=True.
        # We keep it simple and accurate for now.
        _ocr_instance = PaddleOCR(
            use_angle_cls=True,   # auto-rotate upside-down text
            lang="en",
            use_gpu=False,        # CPU-only; set True if GPU available
            show_log=False,
            # Disable unnecessary modules to keep inference fast
            use_doc_orientation_classify=False,
        )
        logger.info("PaddleOCR initialised")
    return _ocr_instance


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
    method: str = "paddleocr"
    error: Optional[str] = None


def extract_text(image_path: str) -> OcrResult:
    """
    Run PaddleOCR on a single image file.
    Returns structured OcrResult with full text and confidence.
    """
    try:
        ocr = _get_ocr()
        raw = ocr.ocr(image_path, cls=True)

        if not raw or raw == [None]:
            return OcrResult(text="", confidence=0.0, word_count=0, method="paddleocr")

        words: List[OcrWord] = []
        lines: List[str] = []
        confidences: List[float] = []

        # raw is a list of pages; we process the first page (invoices are 1 page)
        page = raw[0] if raw else []
        if page is None:
            page = []

        for item in page:
            # PaddleOCR returns: [[bbox], [text, conf]]
            if not item or len(item) < 2:
                continue
            bbox_raw, text_conf = item
            if not text_conf or len(text_conf) < 2:
                continue
            text, conf = text_conf
            if not text or not text.strip():
                continue

            conf_float = float(conf) if conf is not None else 0.0
            words.append(OcrWord(
                text=text.strip(),
                confidence=conf_float,
                bbox=bbox_raw,
            ))
            lines.append(text.strip())
            confidences.append(conf_float)

        if not words:
            return OcrResult(text="", confidence=0.0, word_count=0, method="paddleocr")

        full_text = _reconstruct_text(words)
        agg_confidence = _aggregate_confidence(confidences)

        return OcrResult(
            text=full_text,
            confidence=agg_confidence,
            word_count=len(words),
            words=words,
            method="paddleocr",
        )

    except Exception as exc:
        logger.error("PaddleOCR extraction failed: %s", exc)
        return OcrResult(text="", confidence=0.0, word_count=0,
                         method="paddleocr", error=str(exc))


def _reconstruct_text(words: List[OcrWord]) -> str:
    """
    Re-assemble words into human-readable lines by grouping them
    by their vertical (Y) position on the page.
    Words on the same horizontal band → same line.
    Lines separated by a blank line when there is a large vertical gap.
    """
    if not words:
        return ""

    # Sort words by top-left Y then X
    sorted_words = sorted(words, key=lambda w: (w.bbox[0][1], w.bbox[0][0]))

    lines: List[List[OcrWord]] = []
    current_line: List[OcrWord] = [sorted_words[0]]
    line_y = sorted_words[0].bbox[0][1]

    for word in sorted_words[1:]:
        word_y = word.bbox[0][1]
        word_h = max(abs(word.bbox[2][1] - word.bbox[0][1]), 1)

        if abs(word_y - line_y) < word_h * 0.8:
            # Same line
            current_line.append(word)
        else:
            lines.append(current_line)
            current_line = [word]
            line_y = word_y

    lines.append(current_line)

    # Build text from lines
    text_lines = []
    prev_y = None
    for line_words in lines:
        sorted_line = sorted(line_words, key=lambda w: w.bbox[0][0])
        line_text = " ".join(w.text for w in sorted_line)
        text_lines.append(line_text)

    return "\n".join(text_lines)


def _aggregate_confidence(confidences: List[float]) -> float:
    """
    Returns the weighted-median confidence.
    We take the lower quartile to be conservative – if many words are uncertain
    the overall score should reflect that.
    """
    if not confidences:
        return 0.0
    arr = sorted(confidences)
    # Use 25th percentile so a few bad words drag the score down meaningfully
    idx = max(0, int(len(arr) * 0.25) - 1)
    return round(arr[idx], 4)
