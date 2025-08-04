# 🚫 Disconnect from Railway & Connect to Render

## Current Issue
Your repository is connected to Railway (which you don't want) and Render deployments are failing.

## ✅ Steps to Fix

### 1. Disconnect from Railway

**Option A: Through Railway Dashboard**
1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Find your VokChat project
3. Go to **Settings** → **General**
4. Click **"Delete Project"** or **"Disconnect Repository"**

**Option B: Through GitHub**
1. Go to [GitHub Repository](https://github.com/AbhigyanRaj/Vok.Chat)
2. Click **Settings** tab
3. Scroll to **Deployments** section
4. Find Railway and click **Remove**

### 2. Connect to Render

**Option A: Manual Setup**
1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **"New +"** → **"Web Service"**
3. Connect repository: `AbhigyanRaj/Vok.Chat`
4. Use these settings:
   - **Name**: `vokchat-backend`
   - **Environment**: `Node`
   - **Build Command**: `cd backend && npm install`
   - **Start Command**: `cd backend && npm start`
   - **Environment Variables**: `PORT=5001`, `NODE_ENV=production`

**Option B: Use render.yaml (Recommended)**
1. In Render dashboard, select **"Deploy from render.yaml"**
2. Render will auto-configure using our `render.yaml` file

### 3. Verify Connection

After connecting to Render:
- ✅ No more Railway deployments
- ✅ Render deployments should succeed
- ✅ Backend will be available at `https://your-app-name.onrender.com`

## 🐛 If Render Still Fails

Check the Render logs for specific errors. The most common issues are:
- Build command not finding the backend directory
- Missing environment variables
- Port conflicts

## 📝 Files Updated

- ✅ `render.yaml` - Render deployment configuration
- ✅ `backend/package.json` - Fixed deployment scripts
- ✅ `README.md` - Removed Railway references
- ✅ `DEPLOYMENT.md` - Render-specific deployment guide 