# Manual Testing Checklist

Use this checklist before each deployment to verify the app works correctly across all platforms.

---

## Devices to Test

- [ ] iPhone (Safari browser)
- [ ] iPhone (PWA installed - "Add to Home Screen")
- [ ] iPad (Safari browser)
- [ ] Android phone (Chrome browser)
- [ ] Android phone (PWA installed)
- [ ] Windows laptop (Chrome)
- [ ] Windows laptop (Edge)
- [ ] Mac (Safari)

---

## Core Workflow Tests

### Session Management
- [ ] Create a new session
- [ ] Session appears in the session list
- [ ] Session shows correct creation date
- [ ] Session shows correct expiry date
- [ ] Can delete a session (with confirmation)

### File Upload
- [ ] Upload a PDF invoice
- [ ] Upload a JPEG image
- [ ] Upload a PNG image
- [ ] Take a photo using phone camera (mobile only)
- [ ] Upload multiple files at once
- [ ] File size limit error shown for files > 20MB
- [ ] Unsupported file type error shown correctly
- [ ] Upload progress shows during upload
- [ ] Files appear in review after upload

### Extraction
- [ ] Extracted vendor name appears
- [ ] Extracted GSTIN appears (for tax invoices)
- [ ] Extracted invoice number appears
- [ ] Extracted invoice date appears
- [ ] Extracted total amount appears
- [ ] Document type is classified correctly (TAX_INVOICE, FREIGHT, etc.)
- [ ] Confidence scores are shown

### Review Screen
- [ ] Documents list loads
- [ ] Can filter by "Low Confidence"
- [ ] Can filter by "Missing Fields"
- [ ] Can expand a document row to see all fields
- [ ] Edit button opens edit modal
- [ ] Can edit vendor name
- [ ] Can edit invoice number
- [ ] Can edit amounts
- [ ] Can save edits
- [ ] Can mark document as reviewed
- [ ] Can delete a document from session
- [ ] Duplicate warning shows if same vendor + invoice exists

### Masters
- [ ] Masters page loads
- [ ] Can search vendors by name
- [ ] Can search vendors by GSTIN
- [ ] Can add a new vendor manually
- [ ] Can edit an existing vendor
- [ ] Can download vendor master as CSV
- [ ] Can import CSV file (use sample from /public/sample-data/)
- [ ] Import shows count of created/updated/skipped
- [ ] Imported vendors appear in the list

### Export
- [ ] Export button is present on session page
- [ ] Clicking Export downloads a .xlsx file
- [ ] Excel file opens correctly in Excel/Google Sheets
- [ ] All columns present in export
- [ ] Vendor code is populated for matched vendors
- [ ] Confidence % column is present
- [ ] Export Info sheet contains version and session info

---

## PWA Tests

### Installation
- [ ] "Add to Home Screen" prompt appears (Chrome desktop/Android)
- [ ] On Safari (iPhone), "Add to Home Screen" option in Share menu works
- [ ] App installs and shows as standalone (no browser UI)
- [ ] App icon shows on home screen
- [ ] App launches in standalone mode

### Updates
- [ ] After deploying new version, update banner appears
- [ ] Clicking "Refresh to update" loads the new version
- [ ] Version number in footer/header updates correctly
- [ ] About page shows correct version

### Offline Behavior
- [ ] App loads from cache when offline
- [ ] Appropriate error message when trying to upload while offline
- [ ] App recovers gracefully when connection returns

---

## UI / Responsiveness Tests

- [ ] App looks good on phone (320px-390px wide)
- [ ] App looks good on tablet (768px-1024px wide)
- [ ] App looks good on desktop (1280px+ wide)
- [ ] Bottom navigation visible on mobile
- [ ] Top navigation visible on desktop
- [ ] No horizontal scrollbar on any common viewport
- [ ] Touch targets are large enough (44x44px minimum)
- [ ] Text is readable (no overflow, no tiny text)
- [ ] Buttons show loading state when processing
- [ ] Empty states are clear and helpful

---

## Performance Tests

- [ ] Session list loads in < 2 seconds
- [ ] Upload responds immediately (shows "processing")
- [ ] Extraction completes in < 30 seconds for a typical invoice
- [ ] Export downloads in < 5 seconds for up to 20 documents

---

## Error Handling Tests

- [ ] Wrong DATABASE_URL shows clear error
- [ ] Missing API key shows graceful fallback (uses regex, not crash)
- [ ] Network error during upload shows error message
- [ ] Invalid file type shows helpful error
- [ ] Oversized file shows clear error
- [ ] Editing non-existent document returns 404

---

## Security Tests

- [ ] Session ID cannot access another session's data (verify in API)
- [ ] Uploaded files are only accessible within session
- [ ] No sensitive data (API keys, DB passwords) visible in browser
- [ ] `.env.local` is not committed to git (check .gitignore)
