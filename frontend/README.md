# SLCA Frontend - Smart Learning and Career Assistant

Modern, responsive Next.js 14 frontend application with TypeScript, fully integrated with the SLCA FastAPI backend.

## 🎯 Overview

Production-ready frontend built with Next.js 14, TypeScript, Tailwind CSS, and fully connected to the FastAPI backend.

## 🚀 Quick Start

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## ✅ Features Implemented

### Core Infrastructure
- ✅ Next.js 14 with App Router
- ✅ TypeScript for type safety
- ✅ Tailwind CSS for styling
- ✅ Axios API client with JWT authentication
- ✅ Zustand state management
- ✅ React Hook Form + Zod validation
- ✅ Toast notifications
- ✅ Responsive design

### Pages
- ✅ Landing page with features showcase
- ✅ Login page with form validation
- ✅ Register page with password confirmation
- ✅ Dashboard layout with sidebar navigation
- ✅ Dashboard home with statistics
- ✅ Documents page with upload/URL processing

### Backend Integration
- ✅ Automatic JWT token management
- ✅ Token expiration handling (auto-redirect)
- ✅ All API endpoints typed and ready
- ✅ Error handling with user feedback
- ✅ Protected routes

## 🔗 API Integration

All backend endpoints are fully integrated:

```typescript
// Authentication
api.login({ email, password })
api.register({ email, password, full_name })
api.logout()

// Documents (WORKING IN UI)
api.uploadDocument(file)
api.processUrl(url)
api.getDocuments()
api.deleteDocument(id)

// Ready but UI pending
api.createNote(...)
api.generateSummary(...)
api.generateQuiz(...)
api.getProgressOverview()
api.analyzeResume(file)
```

## 📁 Project Structure

```
frontend/
├── app/                    # Next.js pages
│   ├── page.tsx            # Landing page  
│   ├── login/              # Login page
│   ├── register/           # Register page
│   └── dashboard/          # Protected dashboard
│       ├── layout.tsx      # Sidebar layout
│       ├── page.tsx        # Dashboard home
│       └── documents/      # Document management
│
├── components/
│   ├── ui/                 # Reusable UI components
│   └── providers/          # Context providers
│
├── lib/
│   ├── api.ts              # API client (all endpoints)
│   ├── types.ts            # TypeScript types
│   ├── store.ts            # Auth state management
│   ├── utils.ts            # Helper functions
│   └── validations.ts      # Form schemas
│
└── .env.local              # Environment config
```

## ⚙️ Configuration

Create `.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api
NEXT_PUBLIC_APP_NAME=SLCA
```

## 🎨 UI Components

**Button**: `<Button variant="primary" isLoading={false}>Click</Button>`  
**Input**: `<Input label="Email" error={error} />`  
**Card**: `<Card><CardHeader><CardTitle>...</CardTitle></CardHeader></Card>`  
**Spinner**: `<LoadingSpinner fullScreen />`

## 🚀 Development

```bash
npm run dev       # Start dev server
npm run build     # Production build
npm start         # Start production server
npm run lint      # Run linter
```

## 🧪 Testing the Integration

1. **Start Backend**: `cd backend && python run.py`
2. **Start Frontend**: `cd frontend && npm run dev`
3. **Test Flow**:
   - Register new account at http://localhost:3000/register
   - Login with credentials
   - Upload a document
   - Check backend at http://localhost:8000/docs

## 📋 Modules Status

| Module | Backend | Frontend | Status |
|--------|---------|----------|--------|
| Authentication | ✅ | ✅ | Working |
| Documents | ✅ | ✅ | Working |
| Notes | ✅ | 🟡 | API Ready, UI Pending |
| Summaries | ✅ | 🟡 | API Ready, UI Pending |
| Quizzes | ✅ | 🟡 | API Ready, UI Pending |
| Progress | ✅ | 🟡 | Partial UI |
| Career | ✅ | 🟡 | API Ready, UI Pending |

## 🎯 Next Steps

1. Complete Notes UI
2. Complete Summaries UI
3. Complete Quizzes UI
4. Complete Progress Dashboard
5. Complete Career Module UI

All API integrations are ready - just need UI pages!

## 📞 Troubleshooting

**Can't connect to backend?**
- Ensure backend running on port 8000
- Check `NEXT_PUBLIC_API_URL` in `.env.local`
- Verify CORS enabled in backend

**401 Errors?**
- Token expired (30 min)
- Re-login required

---

**Status**: ✅ Core Features Working  
**Backend Connection**: ✅ Fully Integrated  
**Ready For**: Development & Testing
