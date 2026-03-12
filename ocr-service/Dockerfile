# Python OCR Service
# Installs PaddleOCR, OpenCV, and pdf2image (requires poppler)

FROM python:3.11-slim

# System dependencies
# poppler-utils → pdf2image
# libgomp1 → PaddlePaddle OpenMP support
# libglib2.0-0, libsm6, libxext6, libxrender-dev → OpenCV headless
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

# Pre-download PaddleOCR models at build time so first request is fast
RUN python -c "from paddleocr import PaddleOCR; PaddleOCR(use_angle_cls=True, lang='en', use_gpu=False, show_log=False)"

# Copy source
COPY . .

EXPOSE 8001

CMD ["python", "main.py"]
