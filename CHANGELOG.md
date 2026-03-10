# Changelog

All notable changes to Invoice Scanner are documented here.
Format: `## vX.Y.Z-YYYYMMDD-HHMM`

---

## v0.1.0-dev (Initial Release)

### Features
- Create scan sessions to group invoice batches
- Upload PDFs and images (JPEG, PNG, WebP, HEIC)
- Camera capture on mobile devices
- AI-powered extraction using Claude Vision API
- Regex/OCR fallback when no Claude API key
- Vendor master data management (CSV import/export)
- Vendor matching: GSTIN > exact name > alias > fuzzy
- Confidence scoring for all extracted fields
- Review grid with inline editing
- Duplicate detection within a session
- Excel export with formatting and metadata
- PWA: installable on iPhone, Android, Windows
- Auto-update banner when new version is deployed
- Session auto-expiry (configurable TTL)
- Dark navy + clean UI, responsive for mobile/tablet/desktop

### Extraction Fields
- Vendor Name and GSTIN
- Invoice Number and Date
- Due Date
- Place of Supply
- Taxable Amount, CGST, SGST, IGST, Total
- Line Items (description, quantity, unit price)
- Document classification (TAX_INVOICE, FREIGHT, SERVICE_INVOICE, etc.)

### Accounting Fields (from Master Data)
- Vendor Code, G/L Account, Tax Code, TDS Code
- Distribution Rule, Project Code, Warehouse
- RCM Applicable flag

---

## How Version Numbers Work

Versions follow this format: `vMAJOR.MINOR.PATCH-YYYYMMDD-HHMM`

- `v0.1.0` = Major version 0, minor 1, patch 0
- `-20260310` = Built on March 10, 2026
- `-1430` = At 2:30 PM

The version is visible in the app header/footer and on the About page.
