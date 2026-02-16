# Frontend-Backend Connection Guide

## ✅ Current Status: CONNECTED!

Your authentication system is **already connected** and ready to use! Here's how everything works together.

## 📁 Files Involved

### Backend (FastAPI)
- `backend/users/views.py` - API endpoints for auth
- `backend/users/schemas.py` - Data validation schemas
- `backend/users/auth.py` - JWT token handling
- `backend/users/models.py` - User database model

### Frontend (Next.js)
- `frontend/lib/api.ts` - Axios client with auto-auth
- `frontend/lib/store.ts` - Zustand state management
- `frontend/lib/types.ts` - TypeScript type definitions
- `frontend/lib/validations.ts` - Form validation (Zod)
- `frontend/app/login/page.tsx` - Login page
- `frontend/app/register/page.tsx` - Registration page

## 🔄 How It Works

### 1. Registration Flow
```
User fills form → Frontend validates → POST /api/users/register → 
Backend creates user → Returns JWT token → Frontend saves token → 
Redirects to dashboard
```

### 2. Login Flow
```
User enters credentials → Frontend validates → POST /api/users/login → 
Backend verifies password → Returns JWT token → Frontend saves token → 
Redirects to dashboard
```

### 3. Authenticated Requests
```
User makes request → Axios interceptor adds JWT → Backend verifies token → 
Returns data OR 401 if invalid → Frontend auto-redirects to login on 401
```

## 🧪 Testing the Connection

### Step 1: Start Backend
```bash
cd backend
source venv/bin/activate
python run.py
```
Backend should run at: http://localhost:8000

### Step 2: Start Frontend
```bash
cd frontend
npm run dev
```
Frontend should run at: http://localhost:3000

### Step 3: Test Registration
1. Open http://localhost:3000/register
2. Fill in the form:
   - First Name: Test
   - Last Name: User
   - Email: test@example.com
   - Password: testpass123
   - Confirm Password: testpass123
3. Click "Create Account"
4. Should redirect to dashboard if successful

### Step 4: Test Login
1. Open http://localhost:3000/login
2. Enter credentials:
   - Email: test@example.com
   - Password: testpass123
3. Click "Sign In"
4. Should redirect to dashboard if successful

### Step 5: Verify Token Persistence
1. After login, check browser DevTools → Application → Local Storage
2. Look for `auth-storage` key
3. Should contain user data and token

### Step 6: Test Protected Routes
1. Navigate to http://localhost:3000/dashboard
2. Should show dashboard if logged in
3. Try logging out and accessing again
4. Should redirect to login page

## 🔍 Debugging

### Check Backend Logs
```bash
# In backend terminal, you should see:
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000
```

### Check Frontend Network Requests
1. Open DevTools → Network tab
2. Filter by "Fetch/XHR"
3. Look for requests to `localhost:8000/api/users/`
4. Check request/response data

### Common Issues

#### 1. CORS Errors
**Symptom:** Console shows CORS policy errors
**Fix:** Check `backend/main.py` has CORS middleware:
```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

#### 2. Connection Refused
**Symptom:** "ERR_CONNECTION_REFUSED"
**Fix:** Ensure backend is running on port 8000

#### 3. 401 Unauthorized on Protected Routes
**Symptom:** Immediately redirected to login
**Fix:** Check token is being sent in headers:
- DevTools → Network → Select request → Headers
- Look for `Authorization: Bearer <token>`

#### 4. Token Not Persisting
**Symptom:** Must login after every page refresh
**Fix:** Check browser allows localStorage (not in incognito mode)

## 🎯 Key Features

### Auto-Token Management
- Token automatically added to all requests via Axios interceptor
- Stored in localStorage with Zustand persist middleware
- Auto-logout on 401 responses

### Type Safety
- Full TypeScript types for User, LoginData, RegisterData
- Zod validation on frontend matches Pydantic on backend
- Compile-time error checking

### Error Handling
- Backend errors properly displayed to user
- Toast notifications for success/error states
- Form validation with helpful error messages

## 📝 API Endpoints

| Method | Endpoint | Purpose | Auth Required |
|--------|----------|---------|---------------|
| POST | `/api/users/register` | Create new account | No |
| POST | `/api/users/login` | Login to account | No |
| GET | `/api/users/me` | Get current user info | Yes |
| PUT | `/api/users/me` | Update profile | Yes |
| POST | `/api/users/password-reset-request` | Request password reset | No |
| POST | `/api/users/reset-password` | Reset password with token | No |
| POST | `/api/users/verify-email` | Verify email with token | No |

## 🚀 Next Steps

Once authentication is working:

1. **Add more protected routes** in dashboard
2. **Implement email verification** (currently auto-verified)
3. **Add password reset flow** (endpoints exist, need UI)
4. **Add profile page** to update user info
5. **Add profile picture upload**

## 📚 Testing with REST Client

Use the `backend/api-tests.http` file to test endpoints directly:
1. Install REST Client extension
2. Open `api-tests.http`
3. Click "Send Request" above each test
4. Token auto-forwards between requests

---

**Status:** ✅ Ready to use!
**Last Updated:** February 3, 2026
