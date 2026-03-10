# Master Data Guide

This guide explains how to set up and manage your vendor master data in Invoice Scanner.

---

## What is Master Data?

Master data is the reference information that helps the app automatically fill in accounting fields when an invoice is extracted.

For example:
- When the app sees a DHL invoice with GSTIN `27AABCD3611Q1ZI`, it can automatically fill in:
  - Vendor Code: `V001`
  - G/L Account: `62001` (courier expense)
  - Tax Code: `GST18`
  - TDS Code: `TDS194C`

This saves your team from typing these values manually for every invoice.

---

## Quick Start: Upload a CSV

The fastest way to add vendors is to upload a CSV file.

1. Download the sample CSV: [vendor_master_sample.csv](/sample-data/vendor_master_sample.csv)
2. Open it in Excel or Google Sheets
3. Fill in your vendors
4. Save as CSV
5. Go to **Masters** page in the app
6. Click **Import CSV**
7. Select your file

---

## CSV Format

### Required Columns
| Column | Description | Example |
|--------|-------------|---------|
| `vendorCode` | Your internal vendor code | `V001` |
| `vendorName` | Exact vendor name | `DHL Express India Pvt Ltd` |

### Optional Columns
| Column | Description | Example |
|--------|-------------|---------|
| `gstin` | Vendor's GSTIN number | `27AABCD3611Q1ZI` |
| `panNumber` | PAN number | `AABCD3611Q` |
| `defaultGlAccount` | Default G/L account for this vendor | `62001` |
| `defaultTaxCode` | Default tax code | `GST18` |
| `defaultTdsCode` | Default TDS deduction code | `TDS194C` |
| `defaultDistRule` | Default cost center / distribution rule | `LOGISTICS` |
| `placeOfSupply` | Default place of supply | `Maharashtra` |
| `aliases` | Other names this vendor appears as (comma-separated) | `"DHL Express,DHL India"` |
| `active` | Whether vendor is active (`true`/`false`) | `true` |

### Example CSV
```csv
vendorCode,vendorName,gstin,defaultGlAccount,defaultTaxCode,aliases,active
V001,DHL Express India Pvt Ltd,27AABCD3611Q1ZI,62001,GST18,"DHL Express,DHL India",true
V002,Blue Dart Express Ltd,27AAACB0754H1ZS,62001,GST18,"Blue Dart,Bluedart",true
V003,BLR Logistiks I Ltd,27AAACB3002G2ZC,62003,GST18,,true
```

---

## Vendor Aliases: Why They Matter

A "vendor alias" is an alternate name a vendor might appear under on different invoices.

**Example:** Your vendor "DHL Express (India) Pvt. Ltd." might appear as:
- "DHL EXPRESS (INDIA) PVT LTD."
- "DHL Express India"
- "DHL India Private Limited"

If you add all these as aliases, the app will match any of them to the same vendor record.

**How to add aliases:**
- In the CSV: put them in the `aliases` column, separated by commas
- In the app: Edit a vendor and type aliases in the Aliases section

---

## How Matching Works

When an invoice is extracted, the app tries to match the vendor using this priority:

1. **Exact GSTIN match** (confidence: 98%)
   - If extracted GSTIN exactly matches a vendor's GSTIN

2. **Exact name match** (confidence: 95%)
   - If extracted vendor name exactly matches a vendor name

3. **Alias match** (confidence: 90%)
   - If extracted vendor name exactly matches one of the aliases

4. **Fuzzy name match** (confidence: 60-85%)
   - Similar names (handles typos, OCR errors, abbreviations)

5. **No match** (confidence: 0%)
   - Manual review required

The confidence % is shown next to each field in the Review screen.

---

## Best Practices

### 1. Always use GSTIN when you have it
GSTIN matching is the most reliable method. Add GSTINs for all your vendors.

### 2. Add common aliases
Look at your existing invoices and note the different ways vendor names appear. Add the common variations as aliases.

### 3. Use consistent G/L account codes
Make sure your G/L account codes in the CSV match exactly what your ERP/accounting system uses.

### 4. Keep master data updated
When you get a new vendor, add them to the master before processing their invoices.

### 5. Download and keep a backup
Regularly download your master CSV using the "Download" button on the Masters page.

---

## Updating Existing Vendors

### Method 1: Edit in the App
1. Go to Masters page
2. Find the vendor
3. Click the Edit button (pencil icon)
4. Make your changes
5. Save

### Method 2: Re-import CSV
1. Download current master (Download button)
2. Edit in Excel
3. Re-import — the system will update existing records (upsert)

---

## Frequently Asked Questions

**Q: What if two vendors have the same name?**
A: Use different vendor codes. The matching will use GSTIN to distinguish them.

**Q: What if a vendor has multiple GSTINs (different states)?**
A: Create separate vendor records for each GSTIN (e.g., V001-MH, V001-KA).

**Q: My vendor's GSTIN changed — what do I do?**
A: Edit the vendor record and update the GSTIN. Old documents remain linked to the old record.

**Q: Can I delete a vendor?**
A: Clicking Delete marks the vendor as "Inactive" (soft delete). Historical documents remain linked. This prevents accidental data loss.

**Q: How many vendors can I add?**
A: No limit. The search function helps you find vendors in large lists.

---

## Audit Trail

Every change to vendor master data is automatically logged. This includes:
- When a vendor was created
- What changed when it was edited
- When CSV imports were done
- Who made the change (future feature)

This gives you a history of all master data changes.
