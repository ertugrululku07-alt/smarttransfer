# SmartTransfer Backend - cPanel Deployment Guide

## Overview
This guide deploys the Node.js backend to Natro cPanel hosting using Node.js Selector.

---

## Step 1: Set Up Neon.tech PostgreSQL (Free)
1. Go to [neon.tech](https://neon.tech) → Sign up with Google
2. Create Project → Name: `smarttransfer`, Region: **Europe (Frankfurt)**
3. Copy the **Connection String** (looks like `postgresql://user:pass@host/db?sslmode=require`)

---

## Step 2: Migrate Database Schema to Neon.tech
Open PowerShell in `d:\SmartTransfer\backend` and run:

```bash
# Set Neon.tech URL temporarily
$env:DATABASE_URL="postgresql://YOUR_NEON_URL_HERE"

# Push schema to Neon
npx prisma db push

# Import your local data
node import-data.js
```

---

## Step 3: Update .env.production
Fill in `d:\SmartTransfer\backend\.env.production`:
```
DATABASE_URL=postgresql://YOUR_NEON_URL_HERE
JWT_SECRET=GENERATE_A_64_CHAR_RANDOM_STRING
```

To generate JWT_SECRET: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`

---

## Step 4: Upload to cPanel

### Option A: Node.js Selector (Recommended)
1. Login to cPanel → Find **"Node.js Selector"** or **"Setup Node.js App"**
2. Create Application:
   - **Node.js version**: 18 or 20
   - **Application mode**: Production
   - **Application root**: `smarttransfer-backend`
   - **Application URL**: `webtecari.xyz/api` (or `api.webtecari.xyz`)
   - **Application startup file**: `index.js`
3. Upload the `backend_deploy.tar.gz` file to that folder
4. Extract it in File Manager
5. In Node.js Selector → Click **"Run NPM Install"**
6. Add Environment Variables from `.env.production`
7. Click **"Start App"**

### Option B: SSH (If Available)
```bash
cd ~/public_html/api
tar -xzf backend_deploy.tar.gz
npm install --production
npx prisma generate
# Set env vars in .env file
node index.js
```

---

## Step 5: Update Driver App API URL
After backend is live at `https://webtecari.xyz` (or `https://api.webtecari.xyz`):

In `d:\SmartTransfer\driver-app\app\index.tsx`, line 14:
```js
const API_URL = 'https://webtecari.xyz/api';
// OR if using subdomain:
const API_URL = 'https://api.webtecari.xyz/api';
```

Then rebuild the APK.

---

## Step 6: Update Frontend
In `d:\SmartTransfer\frontend\.env.local`:
```
NEXT_PUBLIC_API_URL=https://webtecari.xyz/api
NEXT_PUBLIC_SOCKET_URL=https://webtecari.xyz
```
