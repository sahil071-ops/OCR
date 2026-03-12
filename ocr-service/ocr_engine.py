"""
EasyOCR engine wrapper.
Returns extracted text, per-word confidence, and aggregate confidence score.
Designed to be swappable – any replacement just needs to implement extract_text().

EasyOCR is chosen over PaddleOCR for its simple, reliable installation:
  pip install easyocr
No Cython, no PaddlePaddle dependency chain, no version conflicts.
Accuracy is comparable for printed invoice text.
"""

import logging
from dataclasses import dataclass, field
from typing import List, Optional

logger = logging.getLogger(__name__)

# Lazy-initialise once – EasyOCR model loading takes ~5s on first call
_reader = None


def _get_reader():
    global _reader
    if _reader is None:
        import easyocr
        # 'en' covers English, digits, and common symbols found in invoices.
        # Add 'hi' here if you need Hindi/Devanagari support.
        _reader = easyocr.Reader(
            ['en'],
            gpu=False,       # CPU-only; set True if a GPU is available
            verbose=False,
        )
        logger.info("EasyOCR reader initialised")
    return _reader


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
    method: str = "easyocr"
    error: Optional[str] = None


def extract_text(image_path: str) -> OcrResult:
    """
    Run EasyOCR on a single image file.
    Returns structured OcrResult with full text and confidence.
    """
    try:
        reader = _get_reader()
        # detail=1 returns (bbox, text, confidence) tuples
        raw = reader.readtext(image_path, detail=1, paragraph=False)

        if not raw:
            return OcrResult(text="", confidence=0.0, word_count=0, method="easyocr")

        words: List[OcrWord] = []
        confidences: List[float] = []

        for item in raw:
            # EasyOCR returns: (bbox, text, confidence)
            # bbox is [[x1,y1],[x2,y1],[x2,y2],[x1,y2]]
            if not item or len(item) < 3:
                continue
            bbox_raw, text, conf = item
            if not text or not text.strip():
                continue

            conf_float = float(conf) if conf is not None else 0.0
            words.append(OcrWord(
                text=text.strip(),
                confidence=conf_float,
                bbox=bbox_raw,
            ))
            confidences.append(conf_float)

        if not words:
            return OcrResult(text="", confidence=0.0, word_count=0, method="easyocr")

        full_text = _reconstruct_text(words)
        agg_confidence = _aggregate_confidence(confidences)

        return OcrResult(
            text=full_text,
            confidence=agg_confidence,
            word_count=len(words),
            words=words,
            method="easyocr",
        )

    except Exception as exc:
        logger.error("EasyOCR extraction failed: %s", exc)
        return OcrResult(text="", confidence=0.0, word_count=0,
                         method="easyocr", error=str(exc))


def _reconstruct_text(words: List[OcrWord]) -> str:
    """
    Re-assemble words into human-readable lines by grouping them
    by their vertical (Y) position on the page.
    Words on the same horizontal band → same line, sorted left-to-right.
    """
    if not words:
        return ""

    # Sort all words by top-left Y then X
    sorted_words = sorted(words, key=lambda w: (w.bbox[0][1], w.bbox[0][0]))

    lines: List[List[OcrWord]] = []
    current_line: List[OcrWord] = [sorted_words[0]]
    line_y = sorted_words[0].bbox[0][1]

    for word in sorted_words[1:]:
        word_y = word.bbox[0][1]
        word_h = max(abs(word.bbox[2][1] - word.bbox[0][1]), 1)

        if abs(word_y - line_y) < word_h * 0.8:
            current_line.append(word)
        else:
            lines.append(current_line)
            current_line = [word]
            line_y = word_y

    lines.append(current_line)

    text_lines = []
    for line_words in lines:
        sorted_line = sorted(line_words, key=lambda w: w.bbox[0][0])
        text_lines.append(" ".join(w.text for w in sorted_line))

    return "\n".join(text_lines)


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
