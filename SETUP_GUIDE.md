# Setup Guide for Invoice Scanner

This guide assumes you are a beginner. Follow every step carefully.

---

## What You Need Before Starting

### 1. A Computer
- Windows laptop, Mac, or Linux computer
- The app runs in your browser — no special hardware needed

### 2. Node.js (JavaScript runtime)
Node.js is required to run the app. You need version 18 or higher.

**How to check if you have it:**
```bash
node --version
```
If it shows `v18.x.x` or higher, you're good.

**How to install Node.js:**
1. Go to https://nodejs.org
2. Download the "LTS" version (recommended for most users)
3. Run the installer
4. Restart your terminal/command prompt
5. Run `node --version` again to confirm

### 3. PostgreSQL Database
PostgreSQL is the database that stores your vendor master data and session info.

**Option A: Easy — Install locally on Windows/Mac**
1. Go to https://www.postgresql.org/download/
2. Download and install the version for your OS
3. During installation, remember the password you set for the `postgres` user
4. Default port is `5432`

**Option B: Easiest — Use a cloud database (no local install)**
- Railway: https://railway.app (free tier available)
- Supabase: https://supabase.com (free tier available)
- Render: https://render.com (free tier available)

For beginners, Railway is recommended — it gives you a PostgreSQL connection string instantly.

### 4. Claude API Key (for AI extraction)
The app uses Claude AI to read invoices intelligently.

1. Go to https://console.anthropic.com
2. Sign up for a free account
3. Go to "API Keys" section
4. Create a new key
5. Copy the key (it starts with `sk-ant-...`)
6. Keep this key secret — never share it or commit it to git

Without this key, the app still works but uses basic regex parsing (lower accuracy).

---

## Step-by-Step Local Setup

### Step 1: Download the Code

If you received a zip file:
1. Unzip it to a folder like `C:\Projects\invoice-scanner` (Windows) or `~/Projects/invoice-scanner` (Mac/Linux)

If using git:
```bash
git clone <repository-url>
cd invoice-scanner
```

### Step 2: Install Dependencies

Open a terminal/command prompt in the project folder and run:

```bash
npm install
```

This downloads all required packages. It may take 1-2 minutes.

**If you see errors about missing packages:** Run `npm install` again.

### Step 3: Create Your Environment File

The app needs configuration through a `.env.local` file.

1. Find the file named `.env.example` in the project folder
2. Copy it and rename the copy to `.env.local`

**On Windows:**
```
copy .env.example .env.local
```

**On Mac/Linux:**
```
cp .env.example .env.local
```

3. Open `.env.local` in a text editor (Notepad, VS Code, etc.)
4. Fill in your values (see section below)

### Step 4: Fill In Your Environment Variables

Open `.env.local` and set these values:

```
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/invoice_scanner"
```

Replace `YOUR_PASSWORD` with the password you set when installing PostgreSQL.

If using a cloud database (Railway, Supabase), they give you the full connection string to paste here.

```
ANTHROPIC_API_KEY="sk-ant-YOUR_KEY_HERE"
```

Paste your Claude API key here.

**Everything else has sensible defaults and can be left as-is for now.**

### Step 5: Create the Database Tables

Run this command to create all the database tables:

```bash
npm run db:push
```

You should see output like:
```
✓ Generated Prisma Client
✓ Database is already in sync with the Prisma schema
```

**If you see connection errors:** Check that PostgreSQL is running and your DATABASE_URL is correct.

### Step 6: Start the App

```bash
npm run dev
```

You should see:
```
▲ Next.js 16.x.x
- Local:        http://localhost:3000
- Network:      http://192.168.1.X:3000   ← Use this for phone testing
```

### Step 7: Open the App

Open your browser and go to: **http://localhost:3000**

You should see the Invoice Scanner home page.

---

## Testing on Your Phone

The development server also runs on your local network, so you can test on your phone.

1. Make sure your phone is on the **same Wi-Fi network** as your computer
2. Look at the terminal output for a line like `Network: http://192.168.1.X:3000`
3. Type that IP address into your phone's browser
4. The app should load on your phone!

**To install as a PWA on your phone:**
- **iPhone (Safari):** Tap the Share button → "Add to Home Screen"
- **Android (Chrome):** Tap the menu (3 dots) → "Add to Home Screen" or "Install App"

---

## Common Errors and Fixes

### "Cannot connect to database"
**Error:** `Can't reach database server at localhost:5432`

**Fix:**
1. Make sure PostgreSQL is running:
   - Windows: Search for "Services", find "PostgreSQL", right-click → Start
   - Mac: Run `brew services start postgresql` (if installed via Homebrew)
2. Check your DATABASE_URL in .env.local
3. Make sure the password is correct

### "Module not found" errors
**Fix:** Run `npm install` again

### "Page not found" or 404 errors
**Fix:** Make sure you ran `npm run dev` and the terminal shows the app is running

### "API key invalid" Claude errors
**Fix:** Check your ANTHROPIC_API_KEY in .env.local — make sure there are no extra spaces

### Port already in use (port 3000)
**Error:** `Error: listen EADDRINUSE: address already in use :::3000`

**Fix:**
- Close any other Next.js apps running
- Or change the port: `npm run dev -- -p 3001` and use http://localhost:3001

---

## What Each File Does

| File/Folder | What It Does |
|-------------|-------------|
| `.env.local` | Your secret configuration (passwords, API keys) |
| `prisma/schema.prisma` | Defines the database structure |
| `src/app/` | All the pages of the app |
| `src/app/api/` | The backend logic (processes uploads, etc.) |
| `src/components/` | Reusable UI pieces |
| `src/lib/extraction/` | The invoice OCR and parsing logic |
| `src/lib/matching/` | Vendor matching logic |
| `src/lib/export/` | Excel generation logic |
| `public/manifest.json` | Makes this a PWA (installable) |
| `public/sw.js` | Service worker (offline support, auto-updates) |
| `uploads/` | Temporary uploaded files (auto-created, auto-cleaned) |

---

## Running Tests

```bash
npm test
```

This runs automated tests to verify the extraction and utility functions work correctly.

---

## Next Steps

Once local setup works:
1. **Add your vendor master data** — See [MASTER_DATA_GUIDE.md](./MASTER_DATA_GUIDE.md)
2. **Test with real invoices** — Upload a few sample invoices
3. **Deploy to production** — See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)
