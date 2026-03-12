# Architecture – Invoice Scanner PWA

Version: v0.2.0
Last updated: March 2026

---

## Why this design exists

The previous architecture sent **every invoice through Claude twice** — once for OCR (Claude Vision) and once for structured extraction (Claude Sonnet). For a typical 100-invoice batch, that meant 200 API calls at Sonnet pricing.

The new architecture runs **Claude only when cheap alternatives have already failed**. For the estimated 95% of clean invoices, the cost is zero.

---

## The 2-Lane Pipeline

```
Upload
  │
  ├─ PDF with native text? ──► Lane A: pdf-parse ──────────────────────────────┐
  │                                                                              │
  └─ Image / Scanned PDF ──────────────────────────────────────────────────────┤
       │                                                                         │
       ├─ OCR Service up? ──► PaddleOCR (Python service) ──────────────────────┤
       │                                                                         │
       └─ Service down? ──► Tesseract.js fallback ────────────────────────────┤
                                                                                 │
                                ┌────────────────────────────────────────────── ┘
                                │
                          Regex field parsing
                                │
                          Vendor matching
                                │
                          Validation checks ─────────────────────────── passes?
                                │ fails                                     │
                                ▼                                           ▼
                       ─────────────                               Lane A complete
                       Lane B: AI Rescue                           Save as PDF_NATIVE
                       ─────────────                               or OCR_ONLY
                                │
                         Low OCR conf?
                         Missing fields?
                         Math doesn't reconcile?
                                │
                    ┌───────────┴───────────┐
                    │                       │
               claude-haiku           claude-sonnet
               (try first)            (escalate if haiku
                                       still fails)
                    │
               Validate again
                    │
               Save as AI_CHEAP or AI_STRONG
```

---

## Processing Lanes

| Lane | Trigger | Cost | Expected % |
|------|---------|------|-----------|
| `PDF_NATIVE` | Digital PDF with embedded text | Free | ~45% |
| `OCR_ONLY` | Clean photo/scanned PDF, PaddleOCR confident | ~Free (self-hosted) | ~50% |
| `AI_CHEAP` | OCR confident but some fields missing/bad totals | claude-haiku pricing | ~4% |
| `AI_STRONG` | Very poor OCR, escalated from haiku | claude-sonnet pricing | ~1% |

---

## Services

### 1. Next.js App (existing)

- **Runtime:** Node.js 20 on Railway
- **Framework:** Next.js 16 App Router
- **Database:** PostgreSQL via Prisma ORM
- **Role:** Frontend UI + API routes + pipeline orchestration

### 2. Python OCR Service (new)

- **Runtime:** Python 3.11 on Railway (separate service)
- **Framework:** FastAPI
- **OCR engine:** PaddleOCR 2.9 (best accuracy for Indian documents)
- **Preprocessing:** OpenCV (deskew, contrast, denoise, auto-crop)
- **Role:** Image-to-text only. No business logic.

The Next.js app calls the OCR service via HTTP. If the service is unavailable, the app falls back to Tesseract.js (bundled), then escalates to Claude Vision only if both fail.

---

## Key files

```
/
├── src/
│   └── lib/
│       └── extraction/
│           ├── pipeline.ts          ← 2-lane orchestrator (start here)
│           ├── textExtractor.ts     ← pdf-parse / OCR service / Tesseract
│           ├── ocrClient.ts         ← HTTP client for Python OCR service
│           ├── claudeExtractor.ts   ← haiku + sonnet rescue (called only from pipeline)
│           ├── validation.ts        ← decides which lane to use
│           ├── fieldParser.ts       ← regex-based field extraction
│           └── normalizer.ts        ← date/amount/text normalisation
│
├── ocr-service/
│   ├── main.py                      ← FastAPI app
│   ├── preprocessing.py             ← OpenCV pipeline
│   └── ocr_engine.py                ← PaddleOCR wrapper
│
└── prisma/schema.prisma             ← includes processingLane, ocrConfidence, aiEstimatedCost
```

---

## Validation thresholds (tunable via env vars)

| Variable | Default | Meaning |
|----------|---------|---------|
| `OCR_CONFIDENCE_THRESHOLD` | `0.65` | Below this → Lane B trigger |
| `OVERALL_CONFIDENCE_THRESHOLD` | `0.60` | Below this → needs review badge |
| `MATH_TOLERANCE` | `0.05` | 5% tolerance for subtotal+tax reconciliation |

---

## Cost comparison

| Scenario | Old cost (per invoice) | New cost (per invoice) |
|----------|----------------------|----------------------|
| Clean digital PDF | Sonnet Vision + Sonnet Text ≈ $0.04 | $0 (pdf-parse) |
| Clean photo | Sonnet Vision + Sonnet Text ≈ $0.05 | $0 (PaddleOCR) |
| Messy photo | Sonnet Vision + Sonnet Text ≈ $0.05 | Haiku ≈ $0.002 |
| Very messy | Sonnet Vision + Sonnet Text ≈ $0.05 | Sonnet ≈ $0.015 |

**Estimated saving for 100 invoices (95 clean, 4 haiku, 1 sonnet):**
Old: ~$4.75 → New: ~$0.023 = **~99% reduction**

---

## PWA & auto-updates

The app is a Next.js PWA. On Railway, every deployment replaces the running instance instantly. The service worker is set to `StaleWhileRevalidate` for assets and `NetworkFirst` for API calls, which means:

- Users get new UI within 1 page refresh after a deploy
- No reinstallation required
- The version number in the footer is baked at build time

---

## Data lifecycle

1. User creates a session (TTL set via `SESSION_TTL_HOURS`)
2. Files uploaded → stored in `/uploads/{sessionId}/`
3. Processing runs in background
4. User reviews → exports → session marked EXPORTED
5. User clicks "Delete Session" → DB row soft-deleted, files removed
6. Cleanup job (`scripts/cleanup-sessions.js`) hard-deletes expired sessions
