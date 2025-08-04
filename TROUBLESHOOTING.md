# 🔧 WebSocket Connection Troubleshooting

## Issue: Frontend can't connect to backend

### ✅ What I Fixed

1. **Updated Socket.IO URL** in `src/App.jsx`:
   - **Before**: `ws://localhost:5001` (hardcoded localhost)
   - **After**: Uses Render backend URL in production

2. **Added Environment Detection**:
   - Production: `https://vok-chat.onrender.com`
   - Development: `ws://localhost:5001`

3. **Added Debug Logging**:
   - Console will show which backend URL it's connecting to

### 🎯 Current Configuration

**Frontend (Vercel):** `https://vok-chat.vercel.app`
**Backend (Render):** `https://vok-chat.onrender.com`

### 🔍 How to Test

1. **Check Console Logs**:
   - Open browser dev tools
   - Look for: `"Connecting to backend at: https://vok-chat.onrender.com"`

2. **Test Backend Health**:
   ```bash
   curl https://vok-chat.onrender.com
   # Should return: "VokChat backend is running"
   ```

3. **Test WebSocket Connection**:
   - Open your app
   - Check console for connection success/error messages

### 🐛 Common Issues

**If still getting connection errors:**

1. **CORS Issues**:
   - Backend CORS is configured for `https://vok-chat.vercel.app`
   - Make sure frontend URL matches exactly

2. **Render Backend Not Running**:
   - Check Render dashboard for deployment status
   - Verify backend is responding at `https://vok-chat.onrender.com`

3. **Environment Variables**:
   - Frontend uses `import.meta.env.PROD` to detect production
   - Backend uses `process.env.PORT` for port configuration

### 📝 Files Modified

- ✅ `src/App.jsx` - Updated Socket.IO URL configuration
- ✅ `backend/index.js` - CORS already configured correctly
- ✅ `render.yaml` - Render deployment configuration

### 🚀 Next Steps

1. **Wait for Vercel deployment** (should auto-deploy)
2. **Test the connection** in your browser
3. **Check console logs** for connection status
4. **Try creating a video call** to test full functionality

The WebSocket connection should now work properly! 🎉 