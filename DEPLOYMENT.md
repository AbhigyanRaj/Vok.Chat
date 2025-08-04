# 🚀 VokChat Deployment Guide - Render

## Fix for Render Deployment Error

The error you encountered was because Render was trying to run `eslint.config.js` in the backend directory, which doesn't exist. Here's how to fix it:

## ✅ What I Fixed

1. **Updated `backend/package.json`** - Added proper scripts and metadata
2. **Created `render.yaml`** - Proper deployment configuration
3. **Created `.env` file** - Environment variables for the backend

## 🎯 Render Deployment Steps

### 1. Connect Your Repository
- Go to [Render Dashboard](https://dashboard.render.com)
- Click "New +" → "Web Service"
- Connect your GitHub repository

### 2. Configure the Service
Use these exact settings:

**Basic Settings:**
- **Name**: `vokchat-backend`
- **Environment**: `Node`
- **Region**: Choose closest to your users
- **Branch**: `main` (or your default branch)

**Build & Deploy Settings:**
- **Build Command**: `cd backend && npm install`
- **Start Command**: `cd backend && npm start`

**Environment Variables:**
```
PORT=5001
NODE_ENV=production
```

### 3. Advanced Settings (Optional)
- **Auto-Deploy**: Enable for automatic deployments
- **Health Check Path**: `/` (the backend has a health check endpoint)

## 🔧 Alternative: Use render.yaml

If you prefer, you can use the `render.yaml` file I created:

1. Push the `render.yaml` file to your repository
2. In Render dashboard, select "Deploy from render.yaml"
3. Render will automatically configure everything

## 🐛 Troubleshooting

### If you still get errors:

1. **Check the logs** in Render dashboard
2. **Verify the build command** is `cd backend && npm install`
3. **Verify the start command** is `cd backend && npm start`
4. **Make sure the backend directory exists** with all files

### Common Issues:

- **Port issues**: Make sure PORT is set to 5001
- **CORS issues**: The backend is configured for `https://vok-chat.vercel.app`
- **Dependencies**: All required packages are in `backend/package.json`

## 📝 Files Created/Modified

1. **`backend/package.json`** - Updated with proper scripts
2. **`backend/.env`** - Environment variables
3. **`render.yaml`** - Render deployment configuration
4. **`DEPLOYMENT.md`** - This guide

## ✅ Verification

After deployment, your backend should:
- Respond to `GET /` with "VokChat backend is running"
- Accept WebSocket connections on the Socket.IO endpoint
- Handle WebRTC signaling for video calls

The backend URL will be something like: `https://your-app-name.onrender.com` 