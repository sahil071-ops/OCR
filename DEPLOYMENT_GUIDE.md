# Deployment Guide

This guide explains how to deploy Invoice Scanner to a server so it's accessible from anywhere.

---

## Option A: Railway (Recommended for Beginners)

Railway is the simplest way to deploy. It handles the server, database, and HTTPS automatically.

### What You'll Need
- A GitHub account (free)
- A Railway account (free at railway.app)
- Your `.env.local` file with all variables filled in

### Steps

**1. Push your code to GitHub**

If you haven't already:
1. Go to https://github.com/new and create a new private repository
2. In your project folder, run:
```bash
git add -A
git commit -m "Initial deployment"
git remote add origin https://github.com/YOUR_USERNAME/invoice-scanner.git
git push -u origin main
```

**2. Create a Railway project**
1. Go to https://railway.app and sign in with GitHub
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Select your `invoice-scanner` repository
5. Railway will automatically detect it's a Next.js app

**3. Add a PostgreSQL database**
1. In your Railway project, click "New" → "Database" → "PostgreSQL"
2. Railway will create the database and set `DATABASE_URL` automatically

**4. Set environment variables**
1. Click on your app service in Railway
2. Go to "Variables" tab
3. Add these variables:
   - `ANTHROPIC_API_KEY` = your Claude API key
   - `SESSION_TTL_HOURS` = 24
   - `NODE_ENV` = production

**5. Deploy**
Railway will automatically deploy when you push to GitHub.

**6. Run database migration**
After first deploy, open the Railway shell and run:
```bash
npm run db:push
```

**7. Get your app URL**
Railway gives you a URL like `https://invoice-scanner-production-xxxx.up.railway.app`

That's it! Your app is live.

---

## Option B: Render

Similar to Railway. Free tier available.

1. Create account at https://render.com
2. New → Web Service → Connect your GitHub repo
3. Settings:
   - **Build Command:** `npm run build`
   - **Start Command:** `npm start`
4. Add a PostgreSQL database (New → PostgreSQL)
5. Copy the Internal Database URL to your service environment variables as `DATABASE_URL`
6. Add your other environment variables
7. Deploy

---

## Option C: VPS / Self-Hosted (Advanced)

For users with their own server (DigitalOcean, AWS, Azure, etc.)

### Requirements
- Ubuntu 20.04+ or similar Linux
- Node.js 18+
- PostgreSQL 14+
- nginx (for HTTPS)
- PM2 (to keep the app running)

### Steps

**1. Set up your server**
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PostgreSQL
sudo apt install postgresql postgresql-contrib -y

# Install PM2
sudo npm install -g pm2
```

**2. Set up PostgreSQL**
```bash
sudo -u postgres psql
CREATE USER invoiceuser WITH PASSWORD 'yourpassword';
CREATE DATABASE invoice_scanner;
GRANT ALL PRIVILEGES ON DATABASE invoice_scanner TO invoiceuser;
\q
```

**3. Deploy the app**
```bash
# Clone repo
git clone https://github.com/YOUR_USERNAME/invoice-scanner.git
cd invoice-scanner

# Install dependencies
npm install

# Create .env.local
nano .env.local
# Fill in your values

# Build the app
npm run build

# Run database migrations
npm run db:push

# Start with PM2
pm2 start npm --name "invoice-scanner" -- start
pm2 save
pm2 startup
```

**4. Set up nginx with HTTPS**
```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 50M;
    }
}
```

```bash
# Install certbot for free HTTPS
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d yourdomain.com
```

---

## Updating the App

### Railway / Render (automatic)
Just push to GitHub:
```bash
git add -A
git commit -m "Updated: describe your changes"
git push
```

The platform will automatically redeploy.

### VPS (manual)
```bash
cd invoice-scanner
git pull
npm install
npm run build
pm2 restart invoice-scanner
```

---

## How Versioning Works on Deploy

Every time you build, the version script runs automatically:

```bash
npm run build
# This runs: node scripts/build-version.js && next build
```

This:
1. Generates a new version string like `v0.1.0-20260310-1430`
2. Updates `.env.local` with the version
3. Updates the service worker cache version (forces cache refresh)
4. Appends to CHANGELOG.md

Users will automatically see a "New version available" banner the next time the version differs from what they have cached.

---

## PWA Update Flow

When you deploy a new version:

1. Service worker detects the new `sw.js` has changed (cache version is different)
2. Browser downloads and installs the new service worker
3. App version banner appears: "A new version is available. Refresh to update."
4. User clicks Refresh
5. New service worker activates, old caches are deleted
6. App loads fresh with latest code

Users **never need to reinstall** the PWA — updates happen automatically.

---

## Session Cleanup (Optional Cron)

Add a cron job to clean up expired sessions and delete uploaded files:

```bash
# Run cleanup every hour
0 * * * * cd /path/to/app && node scripts/cleanup-sessions.js >> /var/log/invoice-cleanup.log 2>&1
```

---

## HTTPS is Required for PWA

- PWA features (camera access, install prompt) require HTTPS
- Railway and Render provide HTTPS automatically
- For VPS, use Let's Encrypt via certbot (free)
- For local testing: localhost works fine without HTTPS

---

## Production Checklist

Before going live:
- [ ] DATABASE_URL points to a production PostgreSQL database
- [ ] ANTHROPIC_API_KEY is set
- [ ] NODE_ENV=production
- [ ] HTTPS is configured
- [ ] Run `npm run db:push` to sync database schema
- [ ] Upload your vendor master CSV via the Masters page
- [ ] Test with one real invoice
- [ ] Test on an iPhone and Android device
- [ ] Test PWA installation ("Add to Home Screen")
