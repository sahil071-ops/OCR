# Migration Guide – v0.1 to v0.2

This document describes how to migrate from the old LLM-first architecture to the new 2-lane pipeline.

---

## What changed

| Area | v0.1 (old) | v0.2 (new) |
|------|-----------|-----------|
| Image OCR | Claude Vision (every invoice) | PaddleOCR service → Tesseract fallback → Claude Vision only if both fail |
| Structured extraction | Claude Sonnet (every invoice) | Regex-only for 95%; haiku rescue for ~4%; sonnet only for ~1% |
| Cost | ~$0.05/invoice | ~$0.0002/invoice average |
| DB schema | No lane tracking | New fields: `processingLane`, `ocrConfidence`, `ocrMethod`, `fallbackReason`, `aiTokensUsed`, `aiEstimatedCost` |
| New service | None | Python OCR microservice (must deploy separately on Railway) |

---

## Migration steps

### Step 1 – Pull the new code

```bash
git pull origin claude/invoice-scanning-pwa-qUcDn
npm install
```

### Step 2 – Update the database schema

Run this once to add the new columns:

```bash
npm run db:push
```

This adds the new fields with safe defaults (`processingLane` defaults to `UNKNOWN`, others to `null`). **Existing data is not touched.**

### Step 3 – Deploy the Python OCR service on Railway

See [SETUP.md – Part 2](./SETUP.md#part-2-production-deployment-on-railway) for the full steps.

Short version:
1. In Railway dashboard: **New Service** → same GitHub repo → root directory = `ocr-service`
2. Note the internal URL

### Step 4 – Add the new environment variable

In Railway Variables for the Next.js app:

```
OCR_SERVICE_URL=http://ocr-service.railway.internal:8001
```

No other Railway variables need to change. `ANTHROPIC_API_KEY` is still used — it's just called far less often now.

### Step 5 – Redeploy

Push or click Redeploy. Done.

---

## What about existing sessions?

Existing processed documents retain all their extracted fields. The new `processingLane` column defaults to `UNKNOWN` for old records — this is correct and expected. New documents processed after the migration will show the correct lane badge.

---

## Rollback plan

If something goes wrong:

1. In Railway, roll back the Next.js app to the previous deployment (Railway keeps deploy history)
2. The OCR service can be left running — it has no effect if `OCR_SERVICE_URL` is not set
3. The DB schema changes (new columns) are backward-compatible — old code ignores unknown columns

---

## Testing the migration

After deploying:

1. Upload a **clean digital PDF invoice** → should show **PDF Text** badge (green)
2. Upload a **clear photo of an invoice** → should show **OCR Only** badge (green)
3. Upload a **blurry or skewed photo** → should show **AI Assist** or **AI Full** badge (yellow/red)
4. Check the Processing Summary panel on the session page
5. Verify the Excel export still works correctly

---

## Tuning the thresholds

If you find too many invoices going to AI (AI% > 10%):
- Raise `OCR_CONFIDENCE_THRESHOLD` (e.g. `0.55`) so more documents pass Lane A
- Check OCR quality by looking at the `ocrConfidence` values in the expanded document view

If accuracy is too low (too many invoices with wrong fields):
- Lower `OCR_CONFIDENCE_THRESHOLD` (e.g. `0.75`) to be more aggressive about AI rescue

Start at the defaults and adjust based on your specific invoice mix.
