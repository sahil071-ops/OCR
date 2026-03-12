# Python OCR Service
# Uses pytesseract + OpenCV for lightweight, reliable OCR.
# Estimated image size: ~400 MB (well within Railway's 4 GB limit).
# No PyTorch, no model downloads, no ML dependency chain.

FROM python:3.11-slim

# System dependencies
# tesseract-ocr + tesseract-ocr-eng  → Tesseract 5 OCR engine + English data
# poppler-utils                      → pdf2image (PDF → image conversion)
# libglib2.0-0, libsm6, libxext6,
#   libxrender-dev, libgl1            → OpenCV headless runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-eng \
    poppler-utils \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies (layer cached separately from source)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Verify Tesseract is working at build time (fast, no download needed)
RUN tesseract --version && python -c "import pytesseract; print('pytesseract OK')"

# Copy source
COPY . .

EXPOSE 8001

CMD ["python", "main.py"]
