# Python OCR Service
# Installs EasyOCR, OpenCV, and pdf2image (requires poppler)

FROM python:3.11-slim

# System dependencies
# poppler-utils  → pdf2image (PDF → image conversion)
# libgomp1       → PyTorch OpenMP support (used by EasyOCR)
# libglib2.0-0, libsm6, libxext6, libxrender-dev, libgl1 → OpenCV headless
RUN apt-get update && apt-get install -y --no-install-recommends \
    poppler-utils \
    libgomp1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first (layer cache)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download EasyOCR models at build time so first request is fast.
# The || true makes this non-fatal if network is unavailable during build.
RUN python -c "import easyocr; easyocr.Reader(['en'], gpu=False, verbose=False)" \
    || echo "EasyOCR model pre-download skipped (will download on first request)"

# Copy source
COPY . .

EXPOSE 8001

CMD ["python", "main.py"]
