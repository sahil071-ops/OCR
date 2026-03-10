# Invoice Scanner PWA

An AI-powered invoice scanning and data extraction web application, installable as a Progressive Web App (PWA).

Built for internal use by AP/accounts teams to scan vendor invoices, extract structured data, and export to Excel.

---

## What This App Does

1. **Create a session** — Group a batch of invoices together
2. **Upload or photograph invoices** — PDF, JPEG, PNG, HEIC (iPhone photos)
3. **AI extracts key fields** — Vendor, GSTIN, invoice number, dates, amounts, tax breakdown
4. **Master data matching** — Links vendors to codes and accounting defaults automatically
5. **Review and correct** — Fix any extraction errors before export
6. **Export to Excel** — Download a formatted `.xlsx` file ready for AP entry

---

## Quick Start

```bash
# 1. Install Node.js v18+ if you don't have it
# Download from: https://nodejs.org

# 2. Install dependencies
npm install

# 3. Set up environment
cp .env.example .env.local
# Edit .env.local with your database URL and Claude API key

# 4. Set up database (needs PostgreSQL running)
npm run db:push

# 5. Start the app
npm run dev
```

Open http://localhost:3000

---

## Required: Get a Claude API Key

The app uses Claude AI for high-quality invoice extraction.

1. Go to https://console.anthropic.com
2. Sign up for an account
3. Create an API key
4. Add it to your .env.local: `ANTHROPIC_API_KEY=sk-ant-...`

Without this, extraction still works but with lower accuracy (regex-only mode).

---

## Documentation

| File | Contents |
|------|---------|
| [SETUP_GUIDE.md](./SETUP_GUIDE.md) | Detailed local setup for beginners |
| [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) | How to deploy to production |
| [MASTER_DATA_GUIDE.md](./MASTER_DATA_GUIDE.md) | Managing vendor master data |
| [CHANGELOG.md](./CHANGELOG.md) | Version history |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend + Backend | Next.js 14, TypeScript, Tailwind CSS |
| Database | PostgreSQL + Prisma ORM |
| AI/OCR | Claude API (Anthropic) + Tesseract.js fallback |
| Excel Export | ExcelJS |
| PWA | Native Service Worker + Web App Manifest |

---

## App Version

Every deployment generates a version like `v0.1.0-20260310-1430`.
Version is visible in the app header. Users see a banner when a new version is available.
