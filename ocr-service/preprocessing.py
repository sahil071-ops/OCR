"""
Image preprocessing pipeline for invoice OCR.
Applies a sequence of corrections to improve OCR accuracy:
  1. Grayscale conversion
  2. Document boundary detection + auto-crop (when possible)
  3. Deskew / straighten
  4. Contrast and brightness enhancement
  5. Denoise
  6. Upscale to optimal OCR resolution (300 DPI equivalent)
"""

import cv2
import numpy as np
from PIL import Image
import io
import logging

logger = logging.getLogger(__name__)

# Target width for OCR – wider = more detail for PaddleOCR
TARGET_OCR_WIDTH = 2000


def preprocess_for_ocr(image_bytes: bytes) -> bytes:
    """
    Takes raw image bytes, returns preprocessed image bytes (PNG).
    Safe to call on any JPEG/PNG/WebP input.
    """
    try:
        # Decode with OpenCV
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            # Fallback: try Pillow decode then re-encode for OpenCV
            pil_img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)

        img = _fix_orientation(img)
        img = _upscale_if_small(img)
        img = _detect_and_crop_document(img)
        img = _deskew(img)
        img = _enhance_contrast(img)
        img = _denoise(img)

        # Encode back to PNG bytes
        success, buf = cv2.imencode(".png", img)
        if not success:
            return image_bytes  # Return original on failure
        return buf.tobytes()

    except Exception as exc:
        logger.warning("Preprocessing failed, using original: %s", exc)
        return image_bytes


# ──────────────────────────────────────────────────────────────
# Step helpers
# ──────────────────────────────────────────────────────────────


def _fix_orientation(img: np.ndarray) -> np.ndarray:
    """
    Rotate the image so text is roughly horizontal.
    Uses Hough line detection to find dominant text angle.
    Only corrects small skews (±45°) to avoid flipping portrait documents.
    """
    try:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        edges = cv2.Canny(gray, 50, 150, apertureSize=3)
        lines = cv2.HoughLines(edges, 1, np.pi / 180, threshold=100)
        if lines is None:
            return img

        angles = []
        for line in lines[:30]:
            rho, theta = line[0]
            angle_deg = np.degrees(theta) - 90
            if -45 < angle_deg < 45:
                angles.append(angle_deg)

        if not angles:
            return img

        median_angle = float(np.median(angles))
        if abs(median_angle) < 0.5:  # No meaningful skew
            return img

        h, w = img.shape[:2]
        center = (w // 2, h // 2)
        M = cv2.getRotationMatrix2D(center, median_angle, 1.0)
        rotated = cv2.warpAffine(
            img, M, (w, h),
            flags=cv2.INTER_CUBIC,
            borderMode=cv2.BORDER_REPLICATE,
        )
        return rotated
    except Exception:
        return img


def _upscale_if_small(img: np.ndarray) -> np.ndarray:
    """Upscale image if it is too small for reliable OCR."""
    h, w = img.shape[:2]
    if w < TARGET_OCR_WIDTH:
        scale = TARGET_OCR_WIDTH / w
        new_w = TARGET_OCR_WIDTH
        new_h = int(h * scale)
        img = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_CUBIC)
    return img


def _detect_and_crop_document(img: np.ndarray) -> np.ndarray:
    """
    Try to find the document rectangle and perspective-correct it.
    Falls back to the original image if no clear boundary is found.
    """
    try:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        edged = cv2.Canny(blurred, 75, 200)

        contours, _ = cv2.findContours(
            edged, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE
        )
        contours = sorted(contours, key=cv2.contourArea, reverse=True)[:10]

        doc_contour = None
        for c in contours:
            peri = cv2.arcLength(c, True)
            approx = cv2.approxPolyDP(c, 0.02 * peri, True)
            if len(approx) == 4:
                area = cv2.contourArea(approx)
                img_area = img.shape[0] * img.shape[1]
                # Only use if contour covers >20% of image
                if area > img_area * 0.2:
                    doc_contour = approx
                    break

        if doc_contour is None:
            return img

        return _four_point_transform(img, doc_contour.reshape(4, 2))
    except Exception:
        return img


def _four_point_transform(img: np.ndarray, pts: np.ndarray) -> np.ndarray:
    """Apply a perspective transform to get a top-down view."""
    rect = _order_points(pts)
    tl, tr, br, bl = rect

    width_a = np.linalg.norm(br - bl)
    width_b = np.linalg.norm(tr - tl)
    max_width = max(int(width_a), int(width_b))

    height_a = np.linalg.norm(tr - br)
    height_b = np.linalg.norm(tl - bl)
    max_height = max(int(height_a), int(height_b))

    if max_width < 100 or max_height < 100:
        return img

    dst = np.array(
        [[0, 0], [max_width - 1, 0], [max_width - 1, max_height - 1], [0, max_height - 1]],
        dtype="float32",
    )
    M = cv2.getPerspectiveTransform(rect, dst)
    return cv2.warpPerspective(img, M, (max_width, max_height))


def _order_points(pts: np.ndarray) -> np.ndarray:
    rect = np.zeros((4, 2), dtype="float32")
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]   # top-left
    rect[2] = pts[np.argmax(s)]   # bottom-right
    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]  # top-right
    rect[3] = pts[np.argmax(diff)]  # bottom-left
    return rect


def _deskew(img: np.ndarray) -> np.ndarray:
    """
    Additional deskew pass using minAreaRect on text blobs.
    Catches skew that the Hough method misses.
    """
    try:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        coords = np.column_stack(np.where(thresh > 0))
        if len(coords) < 100:
            return img
        angle = cv2.minAreaRect(coords)[-1]
        if angle < -45:
            angle = 90 + angle
        if abs(angle) < 0.5 or abs(angle) > 30:
            return img
        h, w = img.shape[:2]
        center = (w // 2, h // 2)
        M = cv2.getRotationMatrix2D(center, angle, 1.0)
        return cv2.warpAffine(
            img, M, (w, h),
            flags=cv2.INTER_CUBIC,
            borderMode=cv2.BORDER_REPLICATE,
        )
    except Exception:
        return img


def _enhance_contrast(img: np.ndarray) -> np.ndarray:
    """
    Enhance contrast using CLAHE (adaptive histogram equalisation).
    Works in LAB colour space to avoid colour shifts.
    """
    try:
        lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        l_eq = clahe.apply(l)
        merged = cv2.merge([l_eq, a, b])
        return cv2.cvtColor(merged, cv2.COLOR_LAB2BGR)
    except Exception:
        return img


def _denoise(img: np.ndarray) -> np.ndarray:
    """
    Light denoising. Uses fastNlMeansDenoisingColored which is effective
    on photo scans without blurring text edges too much.
    """
    try:
        return cv2.fastNlMeansDenoisingColored(img, None, h=6, hColor=6,
                                               templateWindowSize=7, searchWindowSize=21)
    except Exception:
        return img
