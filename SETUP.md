# Setup Guide – Invoice Scanner PWA

This guide takes you from zero to a working local development environment and then to production on Railway.

---

## Prerequisites

You need:
- [Node.js 20+](https://nodejs.org/) (check: `node --version`)
- [npm 9+](https://www.npmjs.com/) (comes with Node.js)
- [Python 3.11+](https://www.python.org/) (check: `python3 --version`)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (optional but recommended for local Postgres)
- A [Railway account](https://railway.app/) for deployment
- An [Anthropic API key](https://console.anthropic.com/) (only needed for the rescue lane)

---

## Part 1: Local Development

### Step 1 – Clone the repo

```bash
git clone <your-repo-url> invoice-scanner
cd invoice-scanner
```

### Step 2 – Install Node.js dependencies

```bash
npm install
```

### Step 3 – Set up environment variables

Copy the example file:

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in:

```
DATABASE_URL=postgresql://invoice:invoice@localhost:5432/invoice_scanner
ANTHROPIC_API_KEY=sk-ant-...          # Get from console.anthropic.com
OCR_SERVICE_URL=http://localhost:8001  # Python OCR service (start below)
SESSION_TTL_HOURS=24
```

### Step 4 – Start PostgreSQL

**Option A: Docker (recommended)**
```bash
docker-compose up -d postgres
```

**Option B: Local Postgres**
Create a database called `invoice_scanner` and update `DATABASE_URL` accordingly.

### Step 5 – Push the database schema

```bash
npm run db:push
```

This creates all tables. Run this again any time you pull changes that include Prisma schema updates.

### Step 6 – Start the Python OCR service

In a new terminal:

```bash
cd ocr-service
python3 -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

The service starts on `http://localhost:8001`. First startup downloads PaddleOCR models (~200 MB) — this takes a few minutes. Subsequent startups are fast.

**Verify it works:**
```bash
curl http://localhost:8001/health
# Expected: {"status":"ok","service":"ocr"}
```

### Step 7 – Start the Next.js app

In another terminal (from the project root):

```bash
npm run dev
```

Open `http://localhost:3000`.

---

## Part 2: Production Deployment on Railway

The app uses two Railway services:

1. **invoice-scanner** – the Next.js app (you already have this)
2. **ocr-service** – the Python OCR microservice (new)

### Step 1 – Deploy the OCR service

In the [Railway dashboard](https://railway.app/):

1. Open your existing OCR project
2. Click **New Service** → **GitHub Repo** (same repo)
3. When asked for the root directory, enter: `ocr-service`
4. Railway detects the `Dockerfile` and builds automatically
5. Note the **internal URL** of this service (e.g. `ocr-service.railway.internal`)

### Step 2 – Set Railway variables for the Next.js app

In your existing **invoice-scanner** service → **Variables**:

| Variable | Value |
|----------|-------|
| `OCR_SERVICE_URL` | `http://ocr-service.railway.internal:8001` |
| `ANTHROPIC_API_KEY` | `sk-ant-...` |
| `SESSION_TTL_HOURS` | `24` |
| `OCR_CONFIDENCE_THRESHOLD` | `0.65` (optional, default shown) |
| `MATH_TOLERANCE` | `0.05` (optional, default shown) |
| `DATABASE_URL` | Already set (your Postgres URL) |

### Step 3 – Redeploy the Next.js app

Railway will redeploy automatically when you push to the branch, or click **Redeploy** manually.

### Step 4 – Verify

After deploy, visit your Railway URL. Upload a test invoice. You should see one of these badges on the processed document:
- **PDF Text** (green) – free path
- **OCR Only** (green) – PaddleOCR worked, no AI
- **AI Assist** (yellow) – haiku was needed
- **AI Full** (red) – sonnet was needed

---

## Part 3: Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | – | PostgreSQL connection string |
| `ANTHROPIC_API_KEY` | No* | – | Claude API key. Without it, rescue lane is disabled but the app still works |
| `OCR_SERVICE_URL` | No | – | URL of the Python OCR service. Without it, app falls back to Tesseract |
| `CLAUDE_MODEL` | No | `claude-sonnet-4-6` | Override the strong rescue model |
| `SESSION_TTL_HOURS` | No | `24` | Hours before a session expires |
| `MAX_UPLOAD_SIZE_BYTES` | No | `20971520` | 20 MB |
| `OCR_CONFIDENCE_THRESHOLD` | No | `0.65` | Below this triggers AI rescue |
| `OVERALL_CONFIDENCE_THRESHOLD` | No | `0.60` | Below this shows "low confidence" badge |
| `MATH_TOLERANCE` | No | `0.05` | Tolerance for subtotal+tax reconciliation |
| `OCR_TIMEOUT_MS` | No | `30000` | Timeout for OCR service HTTP call (ms) |

*If `ANTHROPIC_API_KEY` is not set, messy invoices that OCR cannot read will show with low confidence and require manual review. They will NOT error out.

---

## Part 4: Running Tests

```bash
npm test                 # Run all unit tests once
npm run test:watch       # Watch mode
```

The tests cover field parsing and utility functions. They do not require Anthropic or the OCR service.

---

## Part 5: Troubleshooting

**"OCR service unavailable" in logs**
- Is the OCR service running? Check `http://localhost:8001/health`
- Is `OCR_SERVICE_URL` set correctly?
- The app falls back to Tesseract automatically, so invoices still process

**PaddleOCR models not downloading**
- The Docker build pre-downloads models. If building locally, first startup downloads them (~200 MB)
- Ensure you have internet access during first startup
- Models are cached in `~/.paddleocr/` on the host

**"prisma db push failed"**
- Check `DATABASE_URL` is correct and the database is reachable
- For Railway: ensure `DATABASE_URL` resolves to the public URL at start time

**PDF text extraction empty**
- Some PDFs are image-only (scanned). These go through OCR automatically
- pdf-parse may fail on encrypted or DRM-protected PDFs — they will fall through to OCR

**HEIC images not processing**
- HEIC (iPhone) files need `sharp` to convert. Install `sharp` and it handles automatically
- If sharp is not installed, HEIC files will error; user should convert to JPEG first

**"Low confidence" on clean invoice**
- Check the vendor is in the Masters list (exact GSTIN or name)
- Low confidence often means vendor is not matched — add the vendor to Masters

---

## Part 6: Releasing a New Version

1. Make your code changes
2. Update `package.json` → `version` field (semantic versioning: `MAJOR.MINOR.PATCH`)
3. Commit and push to the branch
4. The build script (`scripts/build-version.js`) auto-generates the version + timestamp
5. The version number appears in the app footer after deployment

The Railway deployment auto-triggers on push. Users see the new version on next page load (no reinstallation required).
